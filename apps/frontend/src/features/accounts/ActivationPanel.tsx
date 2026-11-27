import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { activateAccount } from './accounts.api';
import { getUserError } from '../../lib/presentation';

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
      setError('Las contraseñas deben coincidir.');
      return;
    }
    const controller = new AbortController();
    active.current = controller;
    setBusy(true);
    try {
      await activateAccount(token, password, controller.signal);
      if (!controller.signal.aborted) setComplete(true);
    } catch (failure) {
      if (!controller.signal.aborted) setError(getUserError(failure));
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
      <h1 id="activation-title">Establece tu contraseña</h1>
      {error && <p role="alert">{error}</p>}
      {complete ? (
        <>
          <p role="status">
            Tu contraseña quedó establecida. Ingresa para consultar tus accesos.
            Los candidatos a Director requieren una designación posterior.
          </p>
          <button type="button" onClick={onComplete}>
            Ir al inicio de sesión
          </button>
        </>
      ) : (
        <form
          aria-label="Activación de cuenta"
          onSubmit={(event) => {
            void submit(event);
          }}
        >
          <p>Elige una contraseña o frase de 15 a 128 caracteres.</p>
          <label htmlFor="activation-password">Nueva contraseña</label>
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
          <label htmlFor="activation-confirmation">Repetir contraseña</label>
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
            {busy ? 'Guardando…' : 'Guardar contraseña'}
          </button>
        </form>
      )}
    </section>
  );
}
