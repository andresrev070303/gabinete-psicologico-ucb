// @vitest-environment happy-dom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ActivationPanel } from './ActivationPanel';
import { AccountsPanel } from './AccountsPanel';

const account = {
  accountId: 'candidate',
  givenNames: 'Test',
  familyNames: 'Candidate',
  email: 'candidate@example.test',
  status: 'active',
  roles: [],
  canAssignDirector: true,
};
const page = { items: [account], page: 1, pageSize: 20, total: 1 };
const administrator = {
  accountId: 'admin',
  givenNames: 'Test',
  familyNames: 'Admin',
  email: 'admin@example.test',
  roles: ['administrator'],
  permissions: [
    'accounts.read',
    'accounts.invite_director_candidate',
    'director.assign',
  ],
};
describe('Account management panels', () => {
  const fetchMock = vi.fn<typeof fetch>();
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    vi.stubEnv('VITE_API_URL', '/api');
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });
  function fillPasswords(confirmation = 'a long testing passphrase') {
    fireEvent.change(screen.getByLabelText('Nueva contraseña'), {
      target: { value: 'a long testing passphrase' },
    });
    fireEvent.change(screen.getByLabelText('Repetir contraseña'), {
      target: { value: confirmation },
    });
    fireEvent.submit(
      screen.getByRole('form', { name: 'Activación de cuenta' }),
    );
  }
  it('activates an account without signing it in automatically', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    const complete = vi.fn();
    render(<ActivationPanel token="private-token" onComplete={complete} />);
    fillPasswords();
    expect((await screen.findByRole('status')).textContent).toContain(
      'Tu contraseña quedó establecida',
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    fireEvent.click(
      screen.getByRole('button', { name: 'Ir al inicio de sesión' }),
    );
    expect(complete).toHaveBeenCalledOnce();
  });
  it('rejects mismatched passwords locally and reports an unusable link', async () => {
    render(<ActivationPanel token="private-token" onComplete={() => {}} />);
    fillPasswords('different');
    expect(screen.getByRole('alert').textContent).toBe(
      'Las contraseñas deben coincidir.',
    );
    expect(fetchMock).not.toHaveBeenCalled();
    fetchMock.mockResolvedValueOnce(
      Response.json({ code: 'invalid_activation' }, { status: 400 }),
    );
    fillPasswords();
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toContain(
        'ya fue utilizado',
      ),
    );
    expect(
      (screen.getByLabelText('Nueva contraseña') as HTMLInputElement).value,
    ).toBe('');
  });
  it('creates a private invitation and lets the administrator dismiss its secret', async () => {
    fetchMock.mockResolvedValueOnce(
      Response.json({ items: [], page: 1, pageSize: 20, total: 0 }),
    );
    fetchMock.mockResolvedValueOnce(
      Response.json({
        account: { ...account, status: 'invited' },
        activationToken: 'A'.repeat(43),
        expiresAt: '2026-11-27T10:00:00Z',
      }),
    );
    fetchMock.mockResolvedValueOnce(Response.json(page));
    render(<AccountsPanel identity={administrator} />);
    await screen.findByText('No hay cuentas disponibles para tu perfil.');
    fireEvent.change(screen.getByLabelText('Nombres'), {
      target: { value: 'Test' },
    });
    fireEvent.change(screen.getByLabelText('Apellidos'), {
      target: { value: 'Candidate' },
    });
    fireEvent.change(screen.getByLabelText('Correo electrónico'), {
      target: { value: account.email },
    });
    fireEvent.submit(
      screen.getByRole('form', { name: 'Invitar candidato a Director' }),
    );
    const link = await screen.findByLabelText('Enlace de activación');
    expect((link as HTMLInputElement).value).toContain('/#activate=');
    fireEvent.click(screen.getByRole('button', { name: 'Ocultar enlace' }));
    expect(screen.queryByLabelText('Enlace de activación')).toBeNull();
  });
  it('requires confirmation before replacing the director and refreshes the list', async () => {
    fetchMock.mockResolvedValueOnce(Response.json(page));
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    fetchMock.mockResolvedValueOnce(
      Response.json({
        ...page,
        items: [{ ...account, roles: ['director'], canAssignDirector: false }],
      }),
    );
    render(<AccountsPanel identity={administrator} />);
    fireEvent.click(
      await screen.findByRole('button', { name: 'Designar Director' }),
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Confirmar designación del Director',
      }),
    );
    await screen.findByText('Director');
    expect(
      screen.queryByRole('button', { name: 'Designar Director' }),
    ).toBeNull();
  });
  it('does not expose administrative controls to the director', async () => {
    fetchMock.mockResolvedValueOnce(Response.json(page));
    render(
      <AccountsPanel
        identity={{
          ...administrator,
          roles: ['director'],
          permissions: ['accounts.read'],
        }}
      />,
    );
    await screen.findByText('Test Candidate');
    expect(screen.queryByRole('form')).toBeNull();
    expect(
      screen.queryByRole('button', { name: 'Designar Director' }),
    ).toBeNull();
  });
  it('reports an unavailable account list and allows retrying', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 503 }));
    fetchMock.mockResolvedValueOnce(Response.json(page));
    render(<AccountsPanel identity={administrator} />);
    await screen.findByRole('alert');
    fireEvent.click(screen.getByRole('button', { name: 'Actualizar cuentas' }));
    await screen.findByText('Test Candidate');
  });
});
