import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import {
  changePassword,
  getContact,
  listOwnSessions,
  revokeOwnSession,
  updateContact,
} from './account-lifecycle.api';
import type { OwnSession } from './accounts.types';
import { formatDateTime, getUserError } from '../../lib/presentation';

export function OwnAccessPanel({
  onSessionEnded,
}: {
  onSessionEnded: () => void;
}) {
  const [opened, setOpened] = useState(false);
  return (
    <section className="own-access-panel">
      <h3>Mi acceso</h3>
      <button type="button" onClick={() => setOpened(!opened)}>
        {opened ? 'Ocultar mi acceso' : 'Gestionar mi acceso'}
      </button>
      {opened && <OwnAccessDetails onSessionEnded={onSessionEnded} />}
    </section>
  );
}
function OwnAccessDetails({ onSessionEnded }: { onSessionEnded: () => void }) {
  const [sessions, setSessions] = useState<readonly OwnSession[]>([]);
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const active = useRef<AbortController | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    active.current = controller;
    void Promise.all([
      listOwnSessions(controller.signal),
      getContact(controller.signal),
    ]).then(
      ([items, contact]) => {
        if (!controller.signal.aborted) {
          setSessions(items);
          setPhone(contact ?? '');
          setBusy(false);
        }
      },
      (failure: unknown) => {
        if (!controller.signal.aborted) {
          setError(getUserError(failure));
          setBusy(false);
        }
      },
    );
    return () => active.current?.abort();
  }, []);
  async function run(
    work: (signal: AbortSignal) => Promise<void>,
    success: string,
  ) {
    const controller = new AbortController();
    active.current = controller;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await work(controller.signal);
      if (!controller.signal.aborted) setMessage(success);
    } catch (failure) {
      if (!controller.signal.aborted) setError(getUserError(failure));
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  async function password(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    if (data.get('newPassword') !== data.get('confirmation')) {
      setError('Las contraseñas deben coincidir.');
      return;
    }
    await run(async (signal) => {
      await changePassword(
        String(data.get('currentPassword')),
        String(data.get('newPassword')),
        signal,
      );
      if (!signal.aborted) onSessionEnded();
    }, 'Contraseña actualizada. Ingresa nuevamente.');
    form.reset();
  }
  return (
    <div aria-label="Acceso de mi cuenta" aria-busy={busy}>
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      <form
        aria-label="Mi teléfono de contacto"
        onSubmit={(event) => {
          event.preventDefault();
          void run(
            (signal) => updateContact(phone.trim() || null, signal),
            'Teléfono de contacto actualizado.',
          );
        }}
      >
        <label>
          Mi teléfono de contacto
          <input
            type="tel"
            value={phone}
            maxLength={50}
            onChange={(event) => setPhone(event.target.value)}
            disabled={busy}
          />
        </label>
        <button disabled={busy}>Guardar contacto</button>
      </form>
      <form
        aria-label="Cambiar mi contraseña"
        onSubmit={(event) => {
          void password(event);
        }}
      >
        <label>
          Contraseña actual
          <input
            name="currentPassword"
            type="password"
            autoComplete="current-password"
            required
            disabled={busy}
          />
        </label>
        <label>
          Nueva contraseña
          <input
            name="newPassword"
            type="password"
            autoComplete="new-password"
            minLength={15}
            maxLength={256}
            required
            disabled={busy}
          />
        </label>
        <label>
          Repetir contraseña nueva
          <input
            name="confirmation"
            type="password"
            autoComplete="new-password"
            required
            disabled={busy}
          />
        </label>
        <p>Cambiar tu contraseña cierra todas tus sesiones.</p>
        <button disabled={busy}>Cambiar mi contraseña</button>
      </form>
      <h4>Mis sesiones activas</h4>
      <ul>
        {sessions.map((session) => (
          <li key={session.id}>
            {session.current ? 'Sesión actual' : 'Otra sesión'} — Iniciada{' '}
            {formatDateTime(session.createdAt)}
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                void run(async (signal) => {
                  await revokeOwnSession(session.id, signal);
                  if (signal.aborted) return;
                  if (session.current) onSessionEnded();
                  else setSessions(await listOwnSessions(signal));
                }, 'Sesión revocada.');
              }}
            >
              Revocar sesión {session.current ? 'actual' : 'adicional'}
            </button>
          </li>
        ))}
      </ul>
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          void run(async (signal) => {
            const items = await listOwnSessions(signal);
            if (!signal.aborted) setSessions(items);
          }, 'Sesiones actualizadas.');
        }}
      >
        Actualizar mis sesiones
      </button>
    </div>
  );
}
