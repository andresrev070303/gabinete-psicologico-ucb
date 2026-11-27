import { useHealthCheck } from './features/health/useHealthCheck';
import { AuthenticationPanel } from './features/auth/AuthenticationPanel';
import './App.css';
import { useState } from 'react';
import { ActivationPanel } from './features/accounts/ActivationPanel';
import { AccountsPanel } from './features/accounts/AccountsPanel';
import { IdentityAuditPanel } from './features/accounts/IdentityAuditPanel';

const statusMessages = {
  idle: 'Ready to check the connection.',
  loading: 'Checking the API and PostgreSQL connection...',
  success: 'The API and PostgreSQL connection were verified.',
};

export default function App({
  activationToken = null,
}: {
  activationToken?: string | null;
}) {
  const [token, setToken] = useState(activationToken);
  const { state, checkConnection } = useHealthCheck();
  const isLoading = state.status === 'loading';
  const message =
    state.status === 'error' ? state.message : statusMessages[state.status];

  return (
    <main>
      <h1>Gabinete UCB</h1>
      <p>Development environment</p>
      {token !== null ? (
        <ActivationPanel token={token} onComplete={() => setToken(null)} />
      ) : (
        <AuthenticationPanel>
          {(identity) => (
            <>
              {identity.permissions.includes('accounts.read') && (
                <AccountsPanel key={identity.accountId} identity={identity} />
              )}
              {identity.permissions.includes('audit.read_identity') && (
                <IdentityAuditPanel key={`audit-${identity.accountId}`} />
              )}
            </>
          )}
        </AuthenticationPanel>
      )}
      <section aria-labelledby="health-title" aria-busy={isLoading}>
        <h2 id="health-title">Connection check</h2>
        <p role="status">{message}</p>
        <button
          type="button"
          disabled={isLoading}
          onClick={() => {
            void checkConnection();
          }}
        >
          {isLoading ? 'Checking...' : 'Check connection'}
        </button>
      </section>
    </main>
  );
}
