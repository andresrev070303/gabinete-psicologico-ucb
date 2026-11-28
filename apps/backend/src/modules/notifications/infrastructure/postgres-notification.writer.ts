import { sql } from 'drizzle-orm';
import type { AppTransaction } from '../../../infrastructure/database/database.types.js';
import type { NotificationDraft } from '../application/notification.contracts.js';

/** Participates in the caller's transaction so an assignment and its notification commit together. */
export class PostgresNotificationWriter {
  async enqueue(tx: AppTransaction, input: NotificationDraft): Promise<void> {
    if (input.recipientAccountId === input.senderAccountId) return;
    await tx.execute(sql`INSERT INTO iam.user_notification(recipient_account_id,sender_account_id,event_key,event_type,resource_kind,resource_id,resource_type,resource_title,actor_name)
      SELECT ${input.recipientAccountId}::uuid,${input.senderAccountId}::uuid,${input.eventKey}::uuid,'institutional_assignment',${input.resourceKind},${input.resourceId}::uuid,${input.resourceType},${input.resourceTitle},left(concat_ws(' ',p.given_names,p.family_names),250)
      FROM iam.account a JOIN core.person p ON p.id=a.person_id WHERE a.id=${input.senderAccountId}::uuid
      ON CONFLICT(event_key) DO NOTHING`);
  }
}
