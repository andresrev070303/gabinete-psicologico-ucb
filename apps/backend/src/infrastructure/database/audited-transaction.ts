import { sql } from 'drizzle-orm';
import type { AppDatabase, AppTransaction } from './database.types.js';

/** Constructed by the backend after authenticating the session, never from a request body. */
export type AuditContext = Readonly<{
  accountId: string;
  authSessionId: string;
  requestId: string;
}>;

export class AuditedTransaction {
  constructor(private readonly database: AppDatabase) {}

  /** Authorization and state checks belong inside work, using this same transaction. */
  run<T>(context: AuditContext, work: (transaction: AppTransaction) => Promise<T>): Promise<T> {
    return this.database.transaction(async (transaction) => {
      // Transport audit attribution only; this function does not authenticate a user.
      await transaction.execute(sql`
        SELECT audit.set_request_context(
          ${context.accountId}::uuid,
          ${context.authSessionId}::uuid,
          ${context.requestId}::uuid
        )
      `);
      return work(transaction);
    });
  }
}
