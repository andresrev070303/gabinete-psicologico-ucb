import { useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { AccessLayout } from '../../components/AccessLayout';
import { Icon } from '../../components/Icon';
import { getRoleSummary } from '../../lib/presentation';
import type { AuthenticatedIdentity } from './auth.types';
import { useAuthentication } from './useAuthentication';

export type AuthenticatedWorkspaceProps = Readonly<{
  identity: AuthenticatedIdentity['identity'];
  busy: boolean;
  error: string | null;
  onSignOut: () => Promise<void>;
  onSessionEnded: () => void;
}>;

export function AuthenticationPanel({
  children,
}: {
  children?: (context: AuthenticatedWorkspaceProps) => ReactNode;
} = {}) {
  const { state, authenticate, endSession, clearSession } = useAuthentication();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [helpVisible, setHelpVisible] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    try {
      await authenticate({ email, password });
    } finally {
      setPassword('');
      setPasswordVisible(false);
    }
  }

  if (state.current) {
    const context: AuthenticatedWorkspaceProps = {
      identity: state.current.identity,
      busy: state.busy,
      error: state.error,
      onSignOut: endSession,
      onSessionEnded: clearSession,
    };
    if (children) return children(context);
    return (
      <AccessLayout>
        <section aria-label="Tu sesión">
          <h1>
            {context.identity.givenNames} {context.identity.familyNames}
          </h1>
          <p>Perfiles: {getRoleSummary(context.identity.roles)}</p>
          {context.error && <p role="alert">{context.error}</p>}
          <button
            disabled={context.busy}
            onClick={() => {
              void endSession();
            }}
          >
            Cerrar sesión
          </button>
        </section>
      </AccessLayout>
    );
  }

  return (
    <AccessLayout>
      <section
        className="authentication-panel"
        aria-labelledby="authentication-title"
        aria-busy={state.busy}
      >
        <span className="access-kicker">
          <Icon name="shield" /> ACCESO AL GABINETE
        </span>
        <h1 id="authentication-title">Te damos la bienvenida</h1>
        <p className="access-introduction">
          Ingresa con tu cuenta para continuar.
        </p>
        {state.error && (
          <p className="feedback" id="sign-in-error" role="alert">
            {state.error}
          </p>
        )}
        <form
          aria-label="Ingresar"
          onSubmit={(event) => {
            void submit(event);
          }}
        >
          <label htmlFor="sign-in-email">Correo electrónico</label>
          <div className="input-wrapper">
            <Icon name="mail" />
            <input
              id="sign-in-email"
              type="email"
              autoComplete="username"
              placeholder="nombre@ejemplo.com"
              maxLength={254}
              required
              value={email}
              disabled={state.busy}
              aria-describedby={state.error ? 'sign-in-error' : undefined}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>
          <label htmlFor="sign-in-password">Contraseña</label>
          <div className="input-wrapper">
            <Icon name="lock" />
            <input
              id="sign-in-password"
              type={passwordVisible ? 'text' : 'password'}
              autoComplete="current-password"
              placeholder="Escribe tu contraseña"
              required
              value={password}
              disabled={state.busy}
              aria-describedby={state.error ? 'sign-in-error' : undefined}
              onChange={(event) => setPassword(event.target.value)}
            />
            <button
              type="button"
              className="password-toggle"
              aria-label={
                passwordVisible ? 'Ocultar contraseña' : 'Mostrar contraseña'
              }
              aria-pressed={passwordVisible}
              disabled={state.busy}
              onClick={() => setPasswordVisible(!passwordVisible)}
            >
              <Icon name={passwordVisible ? 'eyeOff' : 'eye'} />
            </button>
          </div>
          <button
            type="button"
            className="help-link"
            aria-expanded={helpVisible}
            aria-controls="sign-in-help"
            onClick={() => setHelpVisible(!helpVisible)}
          >
            ¿Necesitas ayuda para ingresar?
          </button>
          {helpVisible && (
            <p id="sign-in-help" className="help-message">
              El acceso es por invitación. Si olvidaste tu contraseña o
              necesitas una cuenta, comunícate con la persona responsable de tu
              acceso al Gabinete.
            </p>
          )}
          <button
            className="primary-button sign-in-button"
            type="submit"
            disabled={state.busy}
          >
            {state.busy ? 'Un momento…' : 'Ingresar'}
            <Icon name="arrow" />
          </button>
        </form>
        <p className="access-note">
          <Icon name="lock" /> Acceso exclusivo para personas autorizadas.
        </p>
      </section>
    </AccessLayout>
  );
}
