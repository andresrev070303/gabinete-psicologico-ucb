// @vitest-environment happy-dom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AccountsPanel } from './AccountsPanel';
import { AccountEditor } from './AccountEditor';
import { OwnAccessPanel } from './OwnAccessPanel';
import { IdentityAuditPanel } from './IdentityAuditPanel';
const director = {
  accountId: 'director',
  givenNames: 'Current',
  familyNames: 'Director',
  email: 'director@example.test',
  roles: ['director'],
  permissions: [
    'accounts.read',
    'accounts.invite_operational',
    'accounts.update_operational',
    'roles.assign_operational',
    'roles.revoke_operational',
    'accounts.disable_operational',
    'accounts.reinvite_operational',
    'credentials.issue_operational_reset',
  ],
};
const account = {
  accountId: 'target',
  givenNames: 'Test',
  familyNames: 'User',
  email: 'target@example.test',
  roles: ['psychologist'],
  status: 'active',
  managementKind: 'operational' as const,
  canAssignDirector: false,
  contactPhone: null,
};
describe('Operational access screens', () => {
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
  it('lets the director invite a psychologist and reports an email failure without losing the saved invitation', async () => {
    fetcher.mockResolvedValueOnce(
      Response.json({ items: [], total: 0, page: 1, pageSize: 20 }),
    );
    fetcher.mockResolvedValueOnce(
      Response.json({
        account: { ...account, status: 'invited' },
        expiresAt: '2026-11-27T00:00:00Z',
        delivery: 'failed',
      }),
    );
    fetcher.mockResolvedValueOnce(
      Response.json({ items: [account], total: 1, page: 1, pageSize: 20 }),
    );
    render(<AccountsPanel identity={director} />);
    await screen.findByText('No hay cuentas disponibles para tu perfil.');
    fireEvent.change(screen.getByLabelText('Nombres'), {
      target: { value: 'Test' },
    });
    fireEvent.change(screen.getByLabelText('Apellidos'), {
      target: { value: 'User' },
    });
    fireEvent.change(screen.getByLabelText('Correo electrónico'), {
      target: { value: account.email },
    });
    fireEvent.submit(
      screen.getByRole('form', { name: 'Invitar cuenta del equipo' }),
    );
    await screen.findByText(/no pudimos confirmar el envío del correo/u);
    expect(screen.queryByLabelText('Enlace de activación')).toBeNull();
    expect(
      JSON.parse(fetcher.mock.calls[1]![1]!.body as string).roleCodes,
    ).toEqual(['psychologist']);
    expect(
      screen.queryByRole('button', { name: 'Designar Director' }),
    ).toBeNull();
  });
  it('edits names and phone while retaining the immutable sign-in address', async () => {
    fetcher.mockResolvedValueOnce(new Response(null, { status: 204 }));
    const changed = vi.fn().mockResolvedValue(undefined);
    const close = vi.fn();
    render(
      <AccountEditor
        account={account}
        identity={director}
        onChanged={changed}
        onLink={vi.fn()}
        onClose={close}
      />,
    );
    const form = screen.getByRole('form', {
      name: 'Editar datos de la cuenta',
    });
    fireEvent.change(within(form).getByLabelText('Nombres'), {
      target: { value: 'Corrected' },
    });
    fireEvent.submit(form);
    await waitFor(() => expect(changed).toHaveBeenCalledOnce());
    expect(JSON.parse(fetcher.mock.calls[0]![1]!.body as string)).toEqual({
      givenNames: 'Corrected',
      familyNames: 'User',
      contactPhone: null,
    });
    expect(close).toHaveBeenCalledOnce();
  });
  it('requires an explicit disable action and submits its reason', async () => {
    fetcher.mockResolvedValueOnce(new Response(null, { status: 204 }));
    render(
      <AccountEditor
        account={account}
        identity={director}
        onChanged={vi.fn().mockResolvedValue(undefined)}
        onLink={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(fetcher).not.toHaveBeenCalled();
    const form = screen.getByRole('form', { name: 'Desactivar cuenta' });
    fireEvent.change(within(form).getByLabelText('Motivo de desactivación'), {
      target: { value: 'Practice completed' },
    });
    fireEvent.click(within(form).getByRole('checkbox'));
    fireEvent.submit(form);
    await waitFor(() => expect(fetcher).toHaveBeenCalledOnce());
    expect(JSON.parse(fetcher.mock.calls[0]![1]!.body as string)).toEqual({
      reason: 'Practice completed',
    });
  });
  it('loads own access only on request and never asks for a target account ID', async () => {
    const ended = vi.fn();
    render(<OwnAccessPanel onSessionEnded={ended} />);
    expect(fetcher).not.toHaveBeenCalled();
    fetcher.mockResolvedValueOnce(
      Response.json([
        {
          id: 'current',
          createdAt: '2026-11-26',
          expiresAt: '2026-11-27',
          lastSeenAt: null,
          current: true,
        },
      ]),
    );
    fetcher.mockResolvedValueOnce(Response.json({ contactPhone: null }));
    fireEvent.click(
      screen.getByRole('button', { name: 'Gestionar mi acceso' }),
    );
    await screen.findByRole('button', { name: 'Revocar sesión actual' });
    fetcher.mockResolvedValueOnce(new Response(null, { status: 204 }));
    fireEvent.click(
      screen.getByRole('button', { name: 'Revocar sesión actual' }),
    );
    await waitFor(() => expect(ended).toHaveBeenCalledOnce());
    expect(String(fetcher.mock.calls[2]![0])).toContain(
      '/auth/sessions/current/revocations',
    );
  });
  it('rejects a mismatched own password before submitting and clears access after a successful change', async () => {
    const ended = vi.fn();
    render(<OwnAccessPanel onSessionEnded={ended} />);
    fetcher.mockResolvedValueOnce(Response.json([]));
    fetcher.mockResolvedValueOnce(Response.json({ contactPhone: null }));
    fireEvent.click(
      screen.getByRole('button', { name: 'Gestionar mi acceso' }),
    );
    await waitFor(() =>
      expect(
        (screen.getByLabelText('Contraseña actual') as HTMLInputElement)
          .disabled,
      ).toBe(false),
    );
    fireEvent.change(screen.getByLabelText('Contraseña actual'), {
      target: { value: 'old password' },
    });
    fireEvent.change(screen.getByLabelText('Nueva contraseña'), {
      target: { value: 'a new private passphrase' },
    });
    fireEvent.change(screen.getByLabelText('Repetir contraseña nueva'), {
      target: { value: 'different' },
    });
    fireEvent.submit(
      screen.getByRole('form', { name: 'Cambiar mi contraseña' }),
    );
    expect(screen.getByRole('alert').textContent).toContain('deben coincidir');
    expect(fetcher).toHaveBeenCalledTimes(2);
    fetcher.mockResolvedValueOnce(new Response(null, { status: 204 }));
    fireEvent.change(screen.getByLabelText('Repetir contraseña nueva'), {
      target: { value: 'a new private passphrase' },
    });
    fireEvent.submit(
      screen.getByRole('form', { name: 'Cambiar mi contraseña' }),
    );
    await waitFor(() => expect(ended).toHaveBeenCalledOnce());
  });
  it('lets the director revoke the last role explicitly without deleting the account', async () => {
    fetcher.mockResolvedValueOnce(new Response(null, { status: 204 }));
    render(
      <AccountEditor
        account={account}
        identity={director}
        onChanged={vi.fn().mockResolvedValue(undefined)}
        onLink={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    const form = screen.getByRole('form', {
      name: 'Cambiar perfiles operativos',
    });
    fireEvent.click(within(form).getByRole('checkbox', { name: 'Psicólogo' }));
    fireEvent.submit(form);
    await waitFor(() => expect(fetcher).toHaveBeenCalledOnce());
    expect(JSON.parse(fetcher.mock.calls[0]![1]!.body as string)).toEqual({
      roleCodes: [],
    });
  });
  it('reinvites a disabled account with newly selected roles and a fresh private link', async () => {
    const invitation = {
      account: { ...account, status: 'invited', roles: ['assistant'] },
      activationToken: 'A'.repeat(43),
      expiresAt: '2026-11-27T00:00:00Z',
      delivery: 'manual',
    };
    fetcher.mockResolvedValueOnce(Response.json(invitation));
    const link = vi.fn();
    render(
      <AccountEditor
        account={{ ...account, status: 'disabled', roles: [] }}
        identity={director}
        onChanged={vi.fn().mockResolvedValue(undefined)}
        onLink={link}
        onClose={vi.fn()}
      />,
    );
    const form = screen.getByRole('form', { name: 'Volver a invitar' });
    fireEvent.click(within(form).getByRole('checkbox', { name: 'Psicólogo' }));
    fireEvent.click(
      within(form).getByRole('checkbox', { name: 'Auxiliar / pasante' }),
    );
    fireEvent.submit(form);
    await waitFor(() => expect(link).toHaveBeenCalledOnce());
    expect(JSON.parse(fetcher.mock.calls[0]![1]!.body as string)).toEqual({
      roleCodes: ['assistant'],
    });
  });
  it('issues a recovery message without returning the recipient secret to the director', async () => {
    const response = {
      account,
      expiresAt: '2026-11-27T00:00:00Z',
      delivery: 'sent',
    };
    fetcher.mockResolvedValueOnce(Response.json(response));
    const link = vi.fn();
    render(
      <AccountEditor
        account={account}
        identity={director}
        onChanged={vi.fn().mockResolvedValue(undefined)}
        onLink={link}
        onClose={vi.fn()}
      />,
    );
    const form = screen.getByRole('form', {
      name: 'Emitir recuperación de contraseña',
    });
    fireEvent.click(within(form).getByRole('checkbox'));
    fireEvent.submit(form);
    await waitFor(() => expect(link).toHaveBeenCalledOnce());
    expect(link.mock.calls[0]![0]).not.toHaveProperty('activationToken');
  });
  it('keeps an editor open on a rejected operation and displays a safe error', async () => {
    fetcher.mockResolvedValueOnce(
      Response.json(
        { code: 'reauthentication_required', message: 'private server detail' },
        { status: 403 },
      ),
    );
    const close = vi.fn();
    render(
      <AccountEditor
        account={account}
        identity={director}
        onChanged={vi.fn()}
        onLink={vi.fn()}
        onClose={close}
      />,
    );
    fireEvent.submit(
      screen.getByRole('form', { name: 'Cambiar perfiles operativos' }),
    );
    await screen.findByRole('alert');
    expect(screen.getByRole('alert').textContent).toContain(
      'cierra sesión e ingresa nuevamente',
    );
    expect(close).not.toHaveBeenCalled();
  });
  it('reloads a failed audit query and paginates within the same server scope', async () => {
    fetcher.mockResolvedValueOnce(new Response(null, { status: 503 }));
    render(<IdentityAuditPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Mostrar auditoría' }));
    await screen.findByRole('alert');
    fetcher.mockResolvedValueOnce(
      Response.json({ items: [], total: 21, page: 1, pageSize: 20 }),
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Actualizar auditoría' }),
    );
    await screen.findByText('Página 1');
    fetcher.mockResolvedValueOnce(
      Response.json({ items: [], total: 21, page: 2, pageSize: 20 }),
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Página siguiente de auditoría' }),
    );
    await screen.findByText('Página 2');
    expect(String(fetcher.mock.calls[2]![0])).toContain(
      'identity-audit?page=2',
    );
  });
  it('renders scoped audit fields as text without retrieving credential values', async () => {
    render(<IdentityAuditPanel />);
    expect(fetcher).not.toHaveBeenCalled();
    fetcher.mockResolvedValueOnce(
      Response.json({
        items: [
          {
            id: 'event',
            occurredAt: '2026-11-26',
            action: 'account_disabled',
            targetAccountId: 'target',
            actorAccountId: 'actor',
            sessionId: 'session',
            requestId: 'request',
            changedFields: [],
            reason: 'Practice completed',
          },
        ],
        total: 1,
        page: 1,
        pageSize: 20,
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Mostrar auditoría' }));
    await screen.findByText('Desactivación de cuenta');
    expect(screen.getByText('Practice completed')).toBeTruthy();
  });
});
