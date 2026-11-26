import { createHash, randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import type {
  AppDatabase,
  AppTransaction,
} from '../../../infrastructure/database/database.types.js';
import { AuthenticationFailure } from '../application/authentication.contracts.js';
import type {
  AccountCredentials,
  AuthenticatedIdentity,
  AuthenticationStore,
  PublicIdentity,
  SignInRecord,
  SignInResult,
} from '../application/authentication.contracts.js';
import { canUseSession, SESSION_POLICY } from '../domain/session-policy.js';

type SessionRow = {
  id: string;
  accountId: string;
  createdAt: string;
  expiresAt: string;
  lastSeenAt: string | null;
  revokedAt: string | null;
  sessionKind: string;
  checkedAt: string;
};

export class PostgresAuthenticationStore implements AuthenticationStore {
  constructor(private readonly database: AppDatabase) {}

  private async safely<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch {
      throw new AuthenticationFailure('unavailable');
    }
  }

  signIn(
    input: SignInRecord,
    verify: (account: AccountCredentials | null) => Promise<boolean>,
  ): Promise<SignInResult> {
    return this.safely(() =>
      this.database.transaction(async (tx) => {
        const subject = createHash('sha256').update(input.email).digest();
        await tx.execute(
          sql`SELECT pg_advisory_xact_lock(hashtextextended(${'gabinete.sign-in:' + subject.toString('hex')},0))`,
        );
        const failures = await tx.execute<{ count: number }>(sql`
        SELECT count(*)::integer AS count FROM audit.security_event
        WHERE subject_hash=${subject} AND event_type='sign_in_failed'
          AND occurred_at > clock_timestamp() - ${SESSION_POLICY.failureWindowMs} * interval '1 millisecond'
      `);
        if (failures.rows[0].count >= SESSION_POLICY.maxFailures) {
          await this.event(tx, input.requestId, 'sign_in_throttled', subject);
          return { kind: 'rate_limited' };
        }
        const candidates = await tx.execute<AccountCredentials>(sql`
        SELECT a.id AS "accountId", a.password_hash AS "passwordHash", a.account_status AS "accountStatus",
          a.auth_method AS "authMethod", a.mfa_enabled AS "mfaEnabled", p.active AS "personActive"
        FROM iam.account a JOIN core.person p ON p.id=a.person_id
        WHERE lower(a.email)=${input.email} FOR UPDATE OF a
      `);
        const candidate = candidates.rows[0] ?? null;
        if (!(await verify(candidate)) || candidate === null) {
          await this.event(tx, input.requestId, 'sign_in_failed', subject);
          return { kind: 'invalid_credentials' };
        }
        const sessionId = randomUUID();
        await this.context(tx, candidate.accountId, sessionId, input.requestId);
        // The existing AFTER INSERT audit trigger sees the new session before checking ownership.
        const inserted = await tx.execute<SessionRow>(sql`
        INSERT INTO iam.auth_session(id,account_id,token_hash,session_kind,expires_at)
        VALUES(${sessionId}::uuid,${candidate.accountId}::uuid,${input.tokenHash},'interactive',
          clock_timestamp() + ${SESSION_POLICY.absoluteMs} * interval '1 millisecond')
        RETURNING id,created_at::text AS "createdAt",expires_at::text AS "expiresAt"
      `);
        if (input.previousTokenHash) {
          await tx.execute(sql`UPDATE iam.auth_session SET revoked_at=clock_timestamp(),revocation_reason='credential_rotated'
          WHERE account_id=${candidate.accountId}::uuid AND token_hash=${input.previousTokenHash}
            AND id<>${sessionId}::uuid AND revoked_at IS NULL AND session_kind='interactive'`);
        }
        await tx.execute(sql`
        UPDATE iam.auth_session SET revoked_at=clock_timestamp(),revocation_reason='session_limit'
        WHERE id IN (
          SELECT id FROM iam.auth_session WHERE account_id=${candidate.accountId}::uuid
            AND id<>${sessionId}::uuid AND session_kind='interactive' AND revoked_at IS NULL
            AND expires_at>clock_timestamp()
            AND coalesce(last_seen_at,created_at)>clock_timestamp()-${SESSION_POLICY.idleMs}*interval '1 millisecond'
          ORDER BY created_at DESC,id DESC OFFSET ${SESSION_POLICY.maxSessions - 1}
        )
      `);
        await tx.execute(
          sql`UPDATE iam.account SET last_login_at=clock_timestamp() WHERE id=${candidate.accountId}::uuid`,
        );
        await this.event(
          tx,
          input.requestId,
          'sign_in_succeeded',
          subject,
          candidate.accountId,
          sessionId,
        );
        const session = inserted.rows[0];
        return {
          kind: 'success',
          identity: await this.identity(tx, candidate.accountId),
          session: {
            id: session.id,
            createdAt: new Date(session.createdAt).toISOString(),
            expiresAt: new Date(session.expiresAt).toISOString(),
          },
        };
      }),
    );
  }

  authenticate(hash: Buffer): Promise<AuthenticatedIdentity | null> {
    return this.safely(() =>
      this.database.transaction(async (tx) => {
        const rows = await tx.execute<SessionRow>(sql`
        SELECT s.id,s.account_id AS "accountId",s.created_at::text AS "createdAt",s.expires_at::text AS "expiresAt",
          s.last_seen_at::text AS "lastSeenAt",s.revoked_at::text AS "revokedAt",s.session_kind AS "sessionKind",
          clock_timestamp()::text AS "checkedAt"
        FROM iam.auth_session s JOIN iam.account a ON a.id=s.account_id JOIN core.person p ON p.id=a.person_id
        WHERE s.token_hash=${hash} AND a.account_status='active' AND p.active AND NOT a.mfa_enabled
      `);
        const session = rows.rows[0];
        if (!session || !canUseSession(session, Date.parse(session.checkedAt)))
          return null;
        return {
          identity: await this.identity(tx, session.accountId),
          session: {
            id: session.id,
            createdAt: new Date(session.createdAt).toISOString(),
            expiresAt: new Date(session.expiresAt).toISOString(),
          },
        };
      }),
    );
  }

  signOut(
    accountId: string,
    sessionId: string,
    requestId: string,
  ): Promise<void> {
    return this.safely(() =>
      this.database.transaction(async (tx) => {
        const account = await tx.execute<{ email: string }>(
          sql`SELECT email FROM iam.account WHERE id=${accountId}::uuid FOR UPDATE`,
        );
        await this.context(tx, accountId, sessionId, requestId);
        const result =
          await tx.execute(sql`UPDATE iam.auth_session SET revoked_at=clock_timestamp(),revocation_reason='signed_out'
        WHERE id=${sessionId}::uuid AND account_id=${accountId}::uuid AND revoked_at IS NULL RETURNING id`);
        if (result.rowCount)
          await this.event(
            tx,
            requestId,
            'sign_out_succeeded',
            createHash('sha256')
              .update(account.rows[0].email.toLowerCase())
              .digest(),
            accountId,
            sessionId,
          );
      }),
    );
  }

  touch(
    accountId: string,
    sessionId: string,
    requestId: string,
  ): Promise<void> {
    return this.safely(() =>
      this.database.transaction(async (tx) => {
        await tx.execute(
          sql`SELECT id FROM iam.account WHERE id=${accountId}::uuid FOR UPDATE`,
        );
        await this.context(tx, accountId, sessionId, requestId);
        await tx.execute(sql`UPDATE iam.auth_session s SET last_seen_at=clock_timestamp()
        WHERE s.id=${sessionId}::uuid AND s.account_id=${accountId}::uuid AND s.revoked_at IS NULL
          AND s.session_kind='interactive' AND s.expires_at>clock_timestamp()
          AND s.created_at>clock_timestamp()-${SESSION_POLICY.absoluteMs}*interval '1 millisecond'
          AND coalesce(s.last_seen_at,s.created_at)>clock_timestamp()-${SESSION_POLICY.idleMs}*interval '1 millisecond'
          AND coalesce(s.last_seen_at,s.created_at)<=clock_timestamp()-${SESSION_POLICY.activityIntervalMs}*interval '1 millisecond'
          AND EXISTS(SELECT 1 FROM iam.account a JOIN core.person p ON p.id=a.person_id
            WHERE a.id=s.account_id AND a.account_status='active' AND p.active AND NOT a.mfa_enabled)`);
      }),
    );
  }

  private async identity(
    tx: AppTransaction,
    accountId: string,
  ): Promise<PublicIdentity> {
    const result = await tx.execute<PublicIdentity>(sql`
      SELECT a.id AS "accountId",a.email,p.given_names AS "givenNames",p.family_names AS "familyNames",
        ARRAY(SELECT r.code FROM iam.account_role ar JOIN iam.role r ON r.id=ar.role_id
          WHERE ar.account_id=a.id AND ar.revoked_at IS NULL AND r.active ORDER BY r.code) AS roles,
        ARRAY(SELECT permission_code FROM iam.v_effective_permission WHERE account_id=a.id ORDER BY permission_code) AS permissions
      FROM iam.account a JOIN core.person p ON p.id=a.person_id WHERE a.id=${accountId}::uuid
    `);
    return result.rows[0];
  }

  private async context(
    tx: AppTransaction,
    accountId: string,
    sessionId: string,
    requestId: string,
  ) {
    await tx.execute(
      sql`SELECT audit.set_request_context(${accountId}::uuid,${sessionId}::uuid,${requestId}::uuid)`,
    );
  }

  private async event(
    tx: AppTransaction,
    requestId: string,
    type: string,
    subject: Buffer,
    accountId: string | null = null,
    sessionId: string | null = null,
  ) {
    await tx.execute(
      sql`SELECT audit.record_auth_event(${requestId}::uuid,${type},${subject},${accountId}::uuid,${sessionId}::uuid)`,
    );
  }
}
