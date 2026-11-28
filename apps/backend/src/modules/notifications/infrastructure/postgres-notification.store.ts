import { NotificationError } from '../domain/notification.rules.js';
import type { AppTransaction } from '../../../infrastructure/database/database.types.js';
import { sql } from 'drizzle-orm';
import type { AuditContext } from '../../../infrastructure/database/audited-transaction.js';
import { IdentityTransactions } from '../../identity/infrastructure/identity-transactions.js';
import { IdentityOperationError } from '../../identity/application/account-management.contracts.js';
import type {
  NotificationPage,
  NotificationStore,
  UserNotification,
} from '../application/notification.contracts.js';

function decodeCursor(
  cursor: string | null,
): { createdAt: string; id: string } | null {
  if (!cursor) return null;
  try {
    if (!/^[A-Za-z0-9_-]{1,512}$/u.test(cursor)) throw Error();
    const value: unknown = JSON.parse(
      Buffer.from(cursor, 'base64url').toString(),
    );
    if (
      !value ||
      typeof value !== 'object' ||
      !('id' in value) ||
      !('createdAt' in value) ||
      typeof value.id !== 'string' ||
      !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/iu.test(value.id) ||
      typeof value.createdAt !== 'string' ||
      !Number.isFinite(Date.parse(value.createdAt))
    )
      throw Error();
    return { id: value.id, createdAt: value.createdAt };
  } catch {
    throw new NotificationError('invalid_input');
  }
}
export class PostgresNotificationStore implements NotificationStore {
  constructor(private readonly access: IdentityTransactions) {}
  list(actor: AuditContext, cursor: string | null): Promise<NotificationPage> {
    const after = decodeCursor(cursor);
    return this.run(actor, false, async (tx) => {
      const rows = (
        await tx.execute<UserNotification>(sql`SELECT id,resource_kind AS "resourceKind",resource_id AS "resourceId",resource_type AS "resourceType",resource_title AS "resourceTitle",actor_name AS "actorName",created_at::text AS "createdAt",read_at::text AS "readAt"
        FROM iam.user_notification WHERE recipient_account_id=${actor.accountId}::uuid
        ${after ? sql`AND (created_at,id)<(${after.createdAt}::timestamptz,${after.id}::uuid)` : sql``} ORDER BY created_at DESC,id DESC LIMIT 21`)
      ).rows;
      const items = rows.slice(0, 20),
        last = items.at(-1);
      const count = (
        await tx.execute<{ count: number }>(
          sql`SELECT count(*)::integer AS count FROM iam.user_notification WHERE recipient_account_id=${actor.accountId}::uuid AND read_at IS NULL`,
        )
      ).rows[0].count;
      return {
        items,
        unreadCount: count,
        nextCursor:
          rows.length > 20 && last
            ? Buffer.from(
                JSON.stringify({ id: last.id, createdAt: last.createdAt }),
              ).toString('base64url')
            : null,
      };
    });
  }
  markRead(actor: AuditContext, id: string): Promise<void> {
    return this.run(actor, true, async (tx) => {
      const rows = await tx.execute(
        sql`UPDATE iam.user_notification SET read_at=COALESCE(read_at,clock_timestamp()) WHERE id=${id}::uuid AND recipient_account_id=${actor.accountId}::uuid RETURNING id`,
      );
      if (!rows.rows.length) throw new NotificationError('not_found');
    });
  }
  private async run<T>(
    actor: AuditContext,
    mutation: boolean,
    work: (tx: AppTransaction) => Promise<T>,
  ): Promise<T> {
    try {
      return await this.access.runVerified(
        actor,
        {
          mutation,
          permission: 'notifications.read_own',
          roles: ['director', 'psychologist', 'assistant', 'degree_student'],
          recent: false,
          governance: false,
        },
        work,
      );
    } catch (error) {
      if (error instanceof NotificationError) throw error;
      if (error instanceof IdentityOperationError)
        throw new NotificationError(
          error.kind === 'forbidden' ? 'forbidden' : 'unavailable',
        );
      throw new NotificationError('unavailable');
    }
  }
}
