import { useRef, useState } from 'react';
import { Icon } from '../../components/Icon';
import { getRoleSummary } from '../../lib/presentation';
import type { AuthenticatedWorkspaceProps } from '../auth/AuthenticationPanel';
import { WorkspaceContent } from './WorkspaceContent';
import { WorkspaceSidebar } from './WorkspaceSidebar';
import { getNavigation } from './navigation';
import type { WorkspaceSection } from './navigation';

export function Workspace({
  identity,
  busy,
  error,
  onSignOut,
  onSessionEnded,
}: AuthenticatedWorkspaceProps) {
  const [selected, setSelected] = useState<WorkspaceSection>('home');
  const [menuOpen, setMenuOpen] = useState(false);
  const mobileNavigation = useRef<HTMLDialogElement>(null);
  const menuButton = useRef<HTMLButtonElement>(null);
  const contentHeading = useRef<HTMLHeadingElement>(null);
  const restoreMenuFocus = useRef(true);
  const items = getNavigation(identity);
  const current = items.find((item) => item.id === selected) ?? items[0]!;
  const roleSummary = getRoleSummary(identity.roles);
  const initials = (
    (identity.givenNames[0] ?? '') + (identity.familyNames[0] ?? '')
  ).toLocaleUpperCase('es-BO');

  function closeMenu(restoreFocus = true) {
    restoreMenuFocus.current = restoreFocus;
    if (mobileNavigation.current?.open) mobileNavigation.current.close();
    setMenuOpen(false);
  }
  function navigate(id: WorkspaceSection) {
    setSelected(id);
    closeMenu(false);
    requestAnimationFrame(() => contentHeading.current?.focus());
  }
  function openMenu() {
    restoreMenuFocus.current = true;
    mobileNavigation.current?.showModal();
    setMenuOpen(true);
  }
  function handleMenuClosed() {
    setMenuOpen(false);
    if (restoreMenuFocus.current) menuButton.current?.focus();
  }

  const sidebarProps = {
    items,
    selected: current.id,
    busy,
    onNavigate: navigate,
    onClose: () => closeMenu(),
    onSignOut,
  };

  return (
    <div className="workspace-shell">
      <a className="skip-link" href="#workspace-content">
        Saltar al contenido
      </a>
      <aside className="workspace-sidebar">
        <WorkspaceSidebar {...sidebarProps} />
      </aside>
      <dialog
        ref={mobileNavigation}
        className="mobile-navigation"
        id="mobile-navigation"
        aria-label="Menú de navegación"
        onClose={handleMenuClosed}
        onClick={(event) => {
          if (event.target === event.currentTarget) closeMenu();
        }}
      >
        <div className="mobile-navigation-content">
          <WorkspaceSidebar {...sidebarProps} mobile />
        </div>
      </dialog>
      <div className="workspace-main">
        <header className="workspace-header">
          <div className="header-location">
            <button
              ref={menuButton}
              type="button"
              className="icon-button mobile-menu-button"
              aria-label="Abrir menú"
              aria-expanded={menuOpen}
              aria-controls="mobile-navigation"
              onClick={openMenu}
            >
              <Icon name="menu" />
            </button>
            <span>Gabinete de Servicios Psicológicos</span>
          </div>
          <button
            className="user-summary"
            type="button"
            onClick={() => navigate('profile')}
            aria-label="Abrir mi cuenta"
          >
            <span className="user-avatar" aria-hidden="true">
              {initials}
            </span>
            <span>
              <strong>
                {identity.givenNames} {identity.familyNames}
              </strong>
              <small>{roleSummary}</small>
            </span>
          </button>
        </header>
        <main
          id="workspace-content"
          className="workspace-content"
          tabIndex={-1}
        >
          <div className="page-heading">
            <div>
              <span className="eyebrow">TU GABINETE, EN UN MISMO LUGAR</span>
              <h1 ref={contentHeading} tabIndex={-1}>
                {current.label}
              </h1>
              <p>{current.description}</p>
            </div>
            <span className="role-badge">{roleSummary}</span>
          </div>
          {error && (
            <p className="feedback" role="alert">
              {error}
            </p>
          )}
          <WorkspaceContent
            identity={identity}
            current={current}
            items={items}
            initials={initials}
            onNavigate={navigate}
            onSessionEnded={onSessionEnded}
          />
          <footer className="workspace-footer">
            Gabinete de Servicios Psicológicos{' '}
            <span>Universidad Católica Boliviana · Cochabamba</span>
          </footer>
        </main>
      </div>
    </div>
  );
}
