import { useHealthCheck } from './features/health/useHealthCheck';
import { AuthenticationPanel } from './features/auth/AuthenticationPanel';
import './App.css';

const statusMessages = {
  idle: 'Ready to check the connection.',
  loading: 'Checking the API and PostgreSQL connection...',
  success: 'The API and PostgreSQL connection were verified.',
};

export default function App() {
  const { state, checkConnection } = useHealthCheck();
  const isLoading = state.status === 'loading';
  const message =
    state.status === 'error' ? state.message : statusMessages[state.status];

  return (
    <main>
      <h1>Gabinete UCB</h1>
      <p>Development environment</p>
      <AuthenticationPanel />
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
