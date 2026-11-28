import type { AuditContext } from '../../../infrastructure/database/audited-transaction.js';
import type { NotificationStore } from './notification.contracts.js';
export class NotificationService {
  constructor(private readonly store: NotificationStore) {}
  list(actor: AuditContext, cursor: string | null) {
    return this.store.list(actor, cursor);
  }
  markRead(actor: AuditContext, id: string) {
    return this.store.markRead(actor, id);
  }
}
