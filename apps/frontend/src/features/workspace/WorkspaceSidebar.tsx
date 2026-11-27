import { Brand } from '../../components/Brand';
import { Icon } from '../../components/Icon';
import type { NavigationItem, WorkspaceSection } from './navigation';

type WorkspaceSidebarProps = Readonly<{
  items: readonly NavigationItem[];
  selected: WorkspaceSection;
  busy: boolean;
  mobile?: boolean;
  onNavigate: (section: WorkspaceSection) => void;
  onClose: () => void;
  onSignOut: () => Promise<void>;
}>;

export function WorkspaceSidebar({
  items,
  selected,
  busy,
  mobile = false,
  onNavigate,
  onClose,
  onSignOut,
}: WorkspaceSidebarProps) {
  return (
    <>
      <div className="sidebar-brand">
        <Brand light />
        {mobile && (
          <button
            type="button"
            className="icon-button"
            aria-label="Cerrar menú"
            onClick={onClose}
          >
            <Icon name="close" />
          </button>
        )}
      </div>
      <p className="sidebar-caption">ESPACIO DE TRABAJO</p>
      <nav
        className="workspace-navigation"
        aria-label={mobile ? 'Navegación móvil' : 'Navegación principal'}
      >
        {items
          .filter((item) => item.id !== 'profile')
          .map((item) => (
            <button
              key={item.id}
              type="button"
              className={`navigation-item${selected === item.id ? ' is-active' : ''}`}
              aria-current={selected === item.id ? 'page' : undefined}
              onClick={() => onNavigate(item.id)}
            >
              <Icon name={item.icon} />
              <span>{item.label}</span>
              {!item.available && (
                <span className="navigation-dot" aria-label="Próximamente" />
              )}
            </button>
          ))}
      </nav>
      <div className="sidebar-footer">
        <button
          type="button"
          className={`navigation-item${selected === 'profile' ? ' is-active' : ''}`}
          aria-current={selected === 'profile' ? 'page' : undefined}
          onClick={() => onNavigate('profile')}
        >
          <Icon name="person" />
          <span>Mi cuenta</span>
        </button>
        <button
          type="button"
          className="navigation-item"
          disabled={busy}
          onClick={() => {
            void onSignOut();
          }}
        >
          <Icon name="logout" />
          <span>Cerrar sesión</span>
        </button>
        <p>UCB · Cochabamba</p>
      </div>
    </>
  );
}
