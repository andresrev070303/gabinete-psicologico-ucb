import { Icon } from '../../components/Icon';
import type { NavigationItem, WorkspaceSection } from './navigation';

type HomePanelProps = Readonly<{
  givenNames: string;
  items: readonly NavigationItem[];
  onNavigate: (section: WorkspaceSection) => void;
}>;

export function HomePanel({ givenNames, items, onNavigate }: HomePanelProps) {
  const shortcuts = items
    .filter((item) => !['home', 'profile', 'system', 'audit'].includes(item.id))
    .slice(0, 4);
  const primary = shortcuts[0] ?? items.find((item) => item.id === 'profile')!;
  const cards = shortcuts.length ? shortcuts : [primary];

  return (
    <div className="home-panel">
      <section className="welcome-panel">
        <div>
          <span className="eyebrow">UN ESPACIO PARA TU TRABAJO</span>
          <h2>Qué gusto verte, {givenNames}.</h2>
          <p>
            Acompañamos a las personas. Organizamos el trabajo que lo hace
            posible.
          </p>
          <button
            type="button"
            className="primary-button"
            onClick={() => onNavigate(primary.id)}
          >
            Ir a {primary.label.toLocaleLowerCase('es-BO')}
            <Icon name="arrow" />
          </button>
        </div>
        <div className="welcome-illustration" aria-hidden="true">
          <Icon name="book" />
          <span />
          <span />
        </div>
      </section>
      <div className="section-heading">
        <h2>Accesos rápidos</h2>
        <p>Encuentra lo que necesitas para tu jornada.</p>
      </div>
      <div className="shortcut-grid">
        {cards.map((item) => (
          <button
            key={item.id}
            type="button"
            className="shortcut-card"
            onClick={() => onNavigate(item.id)}
          >
            <span className="shortcut-icon">
              <Icon name={item.icon} />
            </span>
            <span className="shortcut-title">{item.label}</span>
            <span className="shortcut-description">{item.description}</span>
            <span
              className={
                item.available ? 'shortcut-action' : 'coming-soon-label'
              }
            >
              {item.available ? 'Abrir sección' : 'Próximamente'}
              {item.available && <Icon name="arrow" />}
            </span>
          </button>
        ))}
      </div>
      <section className="home-note">
        <Icon name="shield" />
        <div>
          <h3>Tu espacio, según tu perfil</h3>
          <p>
            Los accesos disponibles corresponden a las funciones asignadas a tu
            cuenta.
          </p>
        </div>
      </section>
    </div>
  );
}
