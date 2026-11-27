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

export function OwnAccessPanel({
  onSessionEnded,
}: {
  onSessionEnded: () => void;
}) {
  const [opened, setOpened] = useState(false);
  return (
    <section className="own-access-panel">
      <h3>My access</h3>
      <button type="button" onClick={() => setOpened(!opened)}>
        {opened ? 'Hide my access' : 'Manage my access'}
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
          setError(
            failure instanceof Error
              ? failure.message
              : 'Could not load your access.',
          );
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
      if (!controller.signal.aborted)
        setError(
          failure instanceof Error ? failure.message : 'The operation failed.',
        );
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  async function password(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    if (data.get('newPassword') !== data.get('confirmation')) {
      setError('The passwords must match.');
      return;
    }
    await run(async (signal) => {
      await changePassword(
        String(data.get('currentPassword')),
        String(data.get('newPassword')),
        signal,
      );
      if (!signal.aborted) onSessionEnded();
    }, 'Password changed. Sign in again.');
    form.reset();
  }
  return (
    <div aria-label="Own account access" aria-busy={busy}>
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      <form
        aria-label="My contact phone"
        onSubmit={(event) => {
          event.preventDefault();
          void run(
            (signal) => updateContact(phone.trim() || null, signal),
            'Contact phone updated.',
          );
        }}
      >
        <label>
          My contact phone
          <input
            type="tel"
            value={phone}
            maxLength={50}
            onChange={(event) => setPhone(event.target.value)}
            disabled={busy}
          />
        </label>
        <button disabled={busy}>Save my contact</button>
      </form>
      <form
        aria-label="Change my password"
        onSubmit={(event) => {
          void password(event);
        }}
      >
        <label>
          Current password
          <input
            name="currentPassword"
            type="password"
            autoComplete="current-password"
            required
            disabled={busy}
          />
        </label>
        <label>
          New password
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
          Repeat new password
          <input
            name="confirmation"
            type="password"
            autoComplete="new-password"
            required
            disabled={busy}
          />
        </label>
        <p>Changing your password signs out all your sessions.</p>
        <button disabled={busy}>Change my password</button>
      </form>
      <h4>My active sessions</h4>
      <ul>
        {sessions.map((session) => (
          <li key={session.id}>
            {session.current ? 'Current session' : 'Other session'} — Started{' '}
            {new Date(session.createdAt).toLocaleString()}
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                void run(async (signal) => {
                  await revokeOwnSession(session.id, signal);
                  if (signal.aborted) return;
                  if (session.current) onSessionEnded();
                  else setSessions(await listOwnSessions(signal));
                }, 'Session revoked.');
              }}
            >
              Revoke {session.current ? 'current' : 'other'} session
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
          }, 'Sessions refreshed.');
        }}
      >
        Refresh my sessions
      </button>
    </div>
  );
}
