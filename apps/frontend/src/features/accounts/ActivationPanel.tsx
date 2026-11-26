import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { activateAccount } from './accounts.api';

export function ActivationPanel({
  token,
  onComplete,
}: {
  token: string;
  onComplete: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [complete, setComplete] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const active = useRef<AbortController | null>(null);
  useEffect(() => () => active.current?.abort(), []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (password !== confirmation) {
      setError('The passwords must match.');
      return;
    }
    const controller = new AbortController();
    active.current = controller;
    setBusy(true);
    try {
      await activateAccount(token, password, controller.signal);
      if (!controller.signal.aborted) setComplete(true);
    } catch (failure) {
      if (!controller.signal.aborted)
        setError(
          failure instanceof Error
            ? failure.message
            : 'Activation failed. Try again.',
        );
    } finally {
      if (!controller.signal.aborted) {
        setBusy(false);
        setPassword('');
        setConfirmation('');
      }
    }
  }
  return (
    <section
      className="authentication-panel"
      aria-labelledby="activation-title"
      aria-busy={busy}
    >
      <h2 id="activation-title">Activate your account</h2>
      {error && <p role="alert">{error}</p>}
      {complete ? (
        <>
          <p role="status">
            Your account is active. You can sign in. The administrator assigns
            the director role separately.
          </p>
          <button type="button" onClick={onComplete}>
            Go to sign in
          </button>
        </>
      ) : (
        <form
          aria-label="Account activation"
          onSubmit={(event) => {
            void submit(event);
          }}
        >
          <p>Choose a passphrase of 15 to 128 characters.</p>
          <label htmlFor="activation-password">New password</label>
          <input
            id="activation-password"
            type="password"
            autoComplete="new-password"
            minLength={15}
            maxLength={256}
            required
            value={password}
            disabled={busy}
            onChange={(event) => setPassword(event.target.value)}
          />
          <label htmlFor="activation-confirmation">Repeat password</label>
          <input
            id="activation-confirmation"
            type="password"
            autoComplete="new-password"
            required
            value={confirmation}
            disabled={busy}
            onChange={(event) => setConfirmation(event.target.value)}
          />
          <button type="submit" disabled={busy}>
            {busy ? 'Activating...' : 'Activate account'}
          </button>
        </form>
      )}
    </section>
  );
}
