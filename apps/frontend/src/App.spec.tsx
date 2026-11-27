// @vitest-environment happy-dom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';

describe('Application access flow', () => {
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

  it('restores the real workspace and returns to sign-in after logout', async () => {
    fetcher.mockResolvedValueOnce(
      Response.json({
        identity: {
          accountId: 'test-admin',
          givenNames: 'Test',
          familyNames: 'Admin',
          email: 'test@example.test',
          roles: ['administrator'],
          permissions: ['accounts.read'],
        },
        session: {
          id: 'test-session',
          createdAt: '2026-11-27T10:00:00Z',
          expiresAt: '2026-11-28T10:00:00Z',
        },
      }),
    );
    fetcher.mockResolvedValueOnce(new Response(null, { status: 204 }));
    render(<App />);
    await screen.findByRole('heading', { name: 'Inicio', level: 1 });
    expect(
      screen.getByRole('navigation', { name: 'Navegación principal' }),
    ).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }));
    await screen.findByRole('form', { name: 'Ingresar' });
    expect(
      screen.queryByRole('navigation', { name: 'Navegación principal' }),
    ).toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('keeps activation separate from session restoration and requires an explicit return to sign-in', async () => {
    fetcher.mockResolvedValueOnce(new Response(null, { status: 204 }));
    fetcher.mockResolvedValueOnce(new Response(null, { status: 401 }));
    render(<App activationToken="private-test-token" />);
    expect(fetcher).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Nueva contraseña'), {
      target: { value: 'a private testing passphrase' },
    });
    fireEvent.change(screen.getByLabelText('Repetir contraseña'), {
      target: { value: 'a private testing passphrase' },
    });
    fireEvent.submit(
      screen.getByRole('form', { name: 'Activación de cuenta' }),
    );
    await screen.findByRole('status');
    expect(fetcher).toHaveBeenCalledOnce();
    expect(String(fetcher.mock.calls[0]![0])).toContain(
      '/api/auth/activations',
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Ir al inicio de sesión' }),
    );
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
    expect(String(fetcher.mock.calls[1]![0])).toContain('/api/auth/me');
    expect(screen.getByRole('form', { name: 'Ingresar' })).toBeDefined();
  });
});
