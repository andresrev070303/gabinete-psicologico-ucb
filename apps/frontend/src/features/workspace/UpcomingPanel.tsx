import { Icon } from '../../components/Icon';
import type { NavigationItem } from './navigation';

export function UpcomingPanel({
  item,
  onReturn,
}: {
  item: NavigationItem;
  onReturn: () => void;
}) {
  return (
    <section className="upcoming-panel surface-panel" aria-label={item.label}>
      <span className="upcoming-icon">
        <Icon name={item.icon} />
      </span>
      <span className="coming-soon-label">Próximamente</span>
      <h2>Estamos preparando este espacio</h2>
      <p>{item.description}</p>
      <p>Esta sección estará disponible en una próxima etapa del sistema.</p>
      <button type="button" className="primary-button" onClick={onReturn}>
        Volver al inicio
        <Icon name="arrow" />
      </button>
    </section>
  );
}
