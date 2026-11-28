import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Icon } from '../../components/Icon';
import { useAsyncResource, useAsyncMutation } from '../../lib/useAsyncResource';
import { listNotifications, markNotificationRead } from './notifications.api';
import type { UserNotification } from './notifications.api';
import type { RecordKey } from '../institutional/institutional.types';
import { typeLabels } from '../institutional/institutional.presentation';
import type { RecordType } from '../institutional/institutional.types';
import '../../styles/notifications.css';
export function NotificationBell({
  onOpen,
}: {
  onOpen: (key: RecordKey) => void;
}) {
  const [cursor, setCursor] = useState<string | null>(null),
    [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null),
    trigger = useRef<HTMLButtonElement>(null),
    heading = useId();
  const load = useCallback(
    (signal: AbortSignal) => listNotifications(cursor, signal),
    [cursor],
  );
  const resource = useAsyncResource(load),
    mutation = useAsyncMutation();
  const refresh = resource.refresh;
  useEffect(() => {
    const interval = window.setInterval(() => {
      if (document.visibilityState !== 'hidden') void refresh();
    }, 60000);
    return () => window.clearInterval(interval);
  }, [refresh]);
  function show() {
    setOpen(true);
    dialog.current?.showModal();
    void resource.refresh();
  }
  function close() {
    dialog.current?.close();
    setOpen(false);
    trigger.current?.focus();
  }
  async function select(notification: UserNotification) {
    await mutation.run(
      (signal) => markNotificationRead(notification.id, signal),
      async () => {
        close();
        void resource.refresh();
        onOpen({
          kind: notification.resourceKind,
          id: notification.resourceId,
        });
      },
    );
  }
  const unread = resource.data?.unreadCount ?? 0;
  return (
    <>
      <button
        ref={trigger}
        className="icon-button notification-trigger"
        type="button"
        aria-label={`Notificaciones${unread ? `, ${unread} sin leer` : ''}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={show}
      >
        <Icon name="bell" />
        {unread > 0 && (
          <span className="notification-count" aria-hidden="true">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
        {resource.error && (
          <span
            className="notification-error-dot"
            aria-label="No se pudieron actualizar los avisos"
          />
        )}
      </button>
      <dialog
        ref={dialog}
        className="notification-dialog"
        aria-labelledby={heading}
        onCancel={(event) => {
          event.preventDefault();
          if (!mutation.busy) close();
        }}
        onClose={() => setOpen(false)}
      >
        <header>
          <div>
            <h2 id={heading}>Notificaciones</h2>
            <p>{unread ? `${unread} sin leer` : 'Estás al día'}</p>
          </div>
          <button
            type="button"
            aria-label="Cerrar notificaciones"
            disabled={mutation.busy}
            onClick={close}
          >
            ×
          </button>
        </header>
        {resource.busy && <p role="status">Actualizando avisos…</p>}
        {(resource.error || mutation.error) && (
          <p role="alert">
            {resource.error || mutation.error}
            <button
              type="button"
              onClick={() => {
                void resource.refresh();
              }}
            >
              Reintentar
            </button>
          </p>
        )}
        <ul className="notification-list">
          {resource.data?.items.map((notification) => (
            <li
              key={notification.id}
              className={notification.readAt ? '' : 'notification-unread'}
            >
              <span className="notification-symbol" aria-hidden="true">
                <Icon name="users" />
              </span>
              <div>
                <p>
                  <strong>{notification.actorName}</strong> te añadió a{' '}
                  {typeLabels[
                    notification.resourceType as RecordType
                  ]?.toLocaleLowerCase('es') ?? 'un registro'}
                  : <strong>{notification.resourceTitle}</strong>.
                </p>
                <small>
                  {new Intl.DateTimeFormat('es-BO', {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                    timeZone: 'America/La_Paz',
                  }).format(new Date(notification.createdAt))}
                  {!notification.readAt ? ' · Sin leer' : ''}
                </small>
                <button
                  type="button"
                  disabled={mutation.busy}
                  onClick={() => {
                    void select(notification);
                  }}
                >
                  Ver registro
                </button>
              </div>
            </li>
          ))}
        </ul>
        {resource.data && !resource.data.items.length && (
          <p className="notification-empty">Aún no tienes notificaciones.</p>
        )}
        <footer>
          {cursor && (
            <button type="button" onClick={() => setCursor(null)}>
              Más recientes
            </button>
          )}
          {resource.data?.nextCursor && (
            <button
              type="button"
              onClick={() => setCursor(resource.data!.nextCursor)}
            >
              Anteriores
            </button>
          )}
          <button
            type="button"
            disabled={resource.busy}
            onClick={() => {
              void resource.refresh();
            }}
          >
            Actualizar
          </button>
        </footer>
      </dialog>
    </>
  );
}
