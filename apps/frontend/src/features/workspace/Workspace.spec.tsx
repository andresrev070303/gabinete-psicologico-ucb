// @vitest-environment happy-dom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Workspace } from './Workspace';
import type { AuthenticatedWorkspaceProps } from '../auth/AuthenticationPanel';

const director = {
  accountId: 'director',
  givenNames: 'Carla',
  familyNames: 'Espada',
  email: 'director@example.test',
  roles: ['director'],
  permissions: ['accounts.read', 'audit.read_identity'],
};
function props(): AuthenticatedWorkspaceProps {
  return {
    identity: director,
    busy: false,
    error: null,
    onSignOut: vi.fn().mockResolvedValue(undefined),
    onSessionEnded: vi.fn(),
  };
}
function navigation() {
  return within(
    screen.getByRole('navigation', { name: 'Navegación principal' }),
  );
}

describe('Workspace screens', () => {
  const fetcher = vi.fn<typeof fetch>();
  beforeEach(() => {
    fetcher.mockReset();
    vi.stubGlobal('fetch', fetcher);
    vi.stubEnv('VITE_API_URL', '/api');
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('opens future sections without fetching or writing business data', () => {
    render(<Workspace {...props()} />);
    fireEvent.click(
      navigation().getByRole('button', { name: /^Practicantes/u }),
    );
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(
      'Practicantes',
    );
    expect(
      screen.getByRole('heading', { name: 'Estamos preparando este espacio' }),
    ).toBeDefined();
    expect(fetcher).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Volver al inicio' }));
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(
      'Inicio',
    );
  });

  it('loads accounts only when the permitted screen is selected', async () => {
    fetcher.mockResolvedValueOnce(
      Response.json({ items: [], total: 0, page: 1, pageSize: 20 }),
    );
    render(<Workspace {...props()} />);
    expect(fetcher).not.toHaveBeenCalled();
    fireEvent.click(navigation().getByRole('button', { name: 'Usuarios' }));
    await screen.findByText('No hay cuentas disponibles para tu perfil.');
    expect(fetcher).toHaveBeenCalledOnce();
    expect(String(fetcher.mock.calls[0]![0])).toContain('/api/accounts?page=1');
  });
  it.each(['director', 'psychologist'])(
    'opens the calendar in the %s workspace without requesting business data',
    (role) => {
      render(
        <Workspace {...props()} identity={{ ...director, roles: [role] }} />,
      );
      fireEvent.click(navigation().getByRole('button', { name: 'Mi agenda' }));
      expect(
        screen.getByRole('region', { name: 'Calendario de mi agenda' }),
      ).toBeDefined();
      expect(screen.getByRole('table')).toBeDefined();
      expect(
        screen.queryByRole('heading', {
          name: 'Estamos preparando este espacio',
        }),
      ).toBeNull();
      expect(fetcher).not.toHaveBeenCalled();
    },
  );

  it('opens the real own-access panel and delegates logout to the authentication boundary', () => {
    const context = props();
    render(<Workspace {...context} />);
    fireEvent.click(screen.getByRole('button', { name: 'Abrir mi cuenta' }));
    expect(
      screen.getByRole('button', { name: 'Gestionar mi acceso' }),
    ).toBeDefined();
    expect(fetcher).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }));
    expect(context.onSignOut).toHaveBeenCalledOnce();
  });

  it('returns to home when a selected section is removed from the identity', () => {
    const context = props();
    const view = render(<Workspace {...context} />);
    fireEvent.click(
      navigation().getByRole('button', { name: /^Practicantes/u }),
    );
    view.rerender(
      <Workspace
        {...context}
        identity={{ ...director, roles: ['degree_student'], permissions: [] }}
      />,
    );
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(
      'Inicio',
    );
    expect(navigation().queryByRole('button', { name: 'Usuarios' })).toBeNull();
    expect(
      navigation().queryByRole('button', { name: 'Auditoría de accesos' }),
    ).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('opens and closes mobile navigation without starting a request', () => {
    render(<Workspace {...props()} />);
    const open = screen.getByRole('button', { name: 'Abrir menú' });
    fireEvent.click(open);
    const menu = screen.getByRole('dialog', { name: 'Menú de navegación' });
    expect(open.getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(within(menu).getByRole('button', { name: 'Cerrar menú' }));
    expect(open.getAttribute('aria-expanded')).toBe('false');
    expect(fetcher).not.toHaveBeenCalled();
  });
});
