import { useHealthCheck } from '../health/useHealthCheck';
import { Icon } from '../../components/Icon';

const messages = {
  idle: 'Puedes verificar la disponibilidad del servicio.',
  loading: 'Estamos comprobando la conexión…',
  success:
    'La conexión con el servicio y la base de datos funciona correctamente.',
};
export function ServiceStatusPanel() {
  const { state, checkConnection } = useHealthCheck();
  const busy = state.status === 'loading';
  return (
    <section
      className="surface-panel service-status"
      aria-labelledby="service-title"
      aria-busy={busy}
    >
      <span className="shortcut-icon">
        <Icon name="shield" />
      </span>
      <h2 id="service-title">Disponibilidad del servicio</h2>
      <p role={state.status === 'error' ? 'alert' : 'status'}>
        {state.status === 'error' ? state.message : messages[state.status]}
      </p>
      <button
        type="button"
        className="primary-button"
        disabled={busy}
        onClick={() => {
          void checkConnection();
        }}
      >
        {busy ? 'Comprobando…' : 'Verificar conexión'}
      </button>
    </section>
  );
}
