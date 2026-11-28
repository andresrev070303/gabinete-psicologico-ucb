export type NotificationErrorCode =
  'forbidden' | 'not_found' | 'invalid_input' | 'unavailable';
export class NotificationError extends Error {
  constructor(readonly code: NotificationErrorCode) {
    super(code);
    this.name = 'NotificationError';
  }
}
export function canReadNotifications(
  identity: Readonly<{
    roles: readonly string[];
    permissions: readonly string[];
  }> | null,
): boolean {
  return (
    !!identity &&
    identity.permissions.includes('notifications.read_own') &&
    identity.roles.some((role) =>
      ['director', 'psychologist', 'assistant', 'degree_student'].includes(
        role,
      ),
    )
  );
}
