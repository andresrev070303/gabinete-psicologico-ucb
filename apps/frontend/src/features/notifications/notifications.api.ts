import { isRecord, isNullableText, requestJson } from '../../lib/api-response';
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
export type NotificationPage = Readonly<{
  items: readonly UserNotification[];
  nextCursor: string | null;
  unreadCount: number;
}>;
const isNotification = (value: unknown): value is UserNotification =>
  isRecord(value) &&
  [
    'id',
    'resourceKind',
    'resourceId',
    'resourceType',
    'resourceTitle',
    'actorName',
    'createdAt',
  ].every((key) => typeof value[key] === 'string') &&
  ['activity', 'agreement', 'project'].includes(String(value.resourceKind)) &&
  isNullableText(value.readAt);
export const isNotificationPage = (value: unknown): value is NotificationPage =>
  isRecord(value) &&
  Array.isArray(value.items) &&
  value.items.every(isNotification) &&
  isNullableText(value.nextCursor) &&
  typeof value.unreadCount === 'number' &&
  Number.isSafeInteger(value.unreadCount) &&
  value.unreadCount >= 0;
export const listNotifications = (cursor: string | null, signal: AbortSignal) =>
  requestJson(
    `notifications${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`,
    signal,
    isNotificationPage,
  );
export const markNotificationRead = (id: string, signal: AbortSignal) =>
  requestJson(
    `notifications/${encodeURIComponent(id)}/read`,
    signal,
    (value): value is null => value === null,
    { method: 'POST', input: {} },
  );
