import type { AuditContext } from '../../../infrastructure/database/audited-transaction.js';
export type UserNotification = Readonly<{
  id: string;
  resourceKind: 'activity' | 'agreement' | 'project';
  resourceId: string;
  resourceType: string;
  resourceTitle: string;
  actorName: string;
  createdAt: string;
  readAt: string | null;
}>;
export type NotificationDraft = Readonly<{
  recipientAccountId: string;
  senderAccountId: string;
  eventKey: string;
  resourceKind: 'activity' | 'agreement' | 'project';
  resourceId: string;
  resourceType: string;
  resourceTitle: string;
}>;
export type NotificationPage = Readonly<{
  items: readonly UserNotification[];
  nextCursor: string | null;
  unreadCount: number;
}>;
export interface NotificationStore {
  list(actor: AuditContext, cursor: string | null): Promise<NotificationPage>;
  markRead(actor: AuditContext, id: string): Promise<void>;
}
