import { useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import type { AuthenticatedIdentity } from './auth.types';
import { useAuthentication } from './useAuthentication';

export function AuthenticationPanel({
  children,
}: {
  children?: (identity: AuthenticatedIdentity['identity']) => ReactNode;
} = {}) {
  const { state, authenticate, endSession } = useAuthentication();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    try {
      await authenticate({ email, password });
    } finally {
      setPassword('');
    }
  }

  return (
    <section
      className={`authentication-panel${state.current ? ' authentication-panel--signed-in' : ''}`}
      aria-labelledby="authentication-title"
      aria-busy={state.busy}
    >
      <h2 id="authentication-title">
        {state.current ? 'Your session' : 'Sign in'}
      </h2>
      {state.error && <p role="alert">{state.error}</p>}
      {state.current ? (
        <>
          <p>
            {state.current.identity.givenNames}{' '}
            {state.current.identity.familyNames}
          </p>
          <p>{state.current.identity.email}</p>
          <p>
            Roles:{' '}
            {state.current.identity.roles.join(', ') || 'No assigned roles'}
          </p>
          <button
            type="button"
            disabled={state.busy}
            onClick={() => {
              void endSession();
            }}
          >
            Sign out
          </button>
          {children?.(state.current.identity)}
        </>
      ) : (
        <form
          aria-label="Sign in"
          onSubmit={(event) => {
            void submit(event);
          }}
        >
          <label htmlFor="sign-in-email">Email</label>
          <input
            id="sign-in-email"
            type="email"
            autoComplete="username"
            maxLength={254}
            required
            value={email}
            disabled={state.busy}
            onChange={(event) => setEmail(event.target.value)}
          />
          <label htmlFor="sign-in-password">Password</label>
          <input
            id="sign-in-password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            disabled={state.busy}
            onChange={(event) => setPassword(event.target.value)}
          />
          <button type="submit" disabled={state.busy}>
            {state.busy ? 'Please wait...' : 'Sign in'}
          </button>
        </form>
      )}
    </section>
  );
}
