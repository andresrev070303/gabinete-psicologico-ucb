// @vitest-environment happy-dom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthenticationPanel } from './AuthenticationPanel';

const authenticated = {
  identity: {
    accountId: 'account',
    email: 'admin@example.test',
    givenNames: 'Test',
    familyNames: 'Admin',
    roles: ['administrator'],
    permissions: ['accounts.read'],
  },
  session: {
    id: 'session',
    createdAt: '2026-11-26T10:00:00.000Z',
    expiresAt: '2026-11-26T18:00:00.000Z',
  },
};

describe('AuthenticationPanel', () => {
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

  async function signInForm(): Promise<void> {
    render(<AuthenticationPanel />);
    await waitFor(() =>
      expect(
        (screen.getByLabelText('Correo electrónico') as HTMLInputElement)
          .disabled,
      ).toBe(false),
    );
    fireEvent.change(screen.getByLabelText('Correo electrónico'), {
      target: { value: 'admin@example.test' },
    });
    fireEvent.change(screen.getByLabelText('Contraseña'), {
      target: { value: 'exact password' },
    });
    fireEvent.submit(screen.getByRole('form', { name: 'Ingresar' }));
  }

  it('restores a persisted identity after reloading the page', async () => {
    fetchMock.mockResolvedValueOnce(Response.json(authenticated));
    render(<AuthenticationPanel />);
    expect(await screen.findByText('Test Admin')).toBeDefined();
    expect(screen.getByText('Perfiles: Administrador')).toBeDefined();
    expect(screen.queryByLabelText('Contraseña')).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('signs in, signs out and clears the submitted password', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 401 }));
    fetchMock.mockResolvedValueOnce(Response.json(authenticated));
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await signInForm();
    expect(await screen.findByText('Test Admin')).toBeDefined();
    expect(fetchMock.mock.calls[1]![1]?.body).toBe(
      JSON.stringify({
        email: 'admin@example.test',
        password: 'exact password',
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }));
    const field = await screen.findByLabelText('Contraseña');
    expect((field as HTMLInputElement).value).toBe('');
    expect(screen.queryByText('Test Admin')).toBeNull();
  });

  it('keeps the form usable and clears the password after rejected credentials', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 401 }));
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 401 }));
    await signInForm();
    expect((await screen.findByRole('alert')).textContent).toBe(
      'El correo electrónico o la contraseña son incorrectos.',
    );
    expect(
      (screen.getByLabelText('Contraseña') as HTMLInputElement).value,
    ).toBe('');
    expect(
      (screen.getByLabelText('Correo electrónico') as HTMLInputElement).value,
    ).toBe('admin@example.test');
    expect(
      (screen.getByRole('button', { name: 'Ingresar' }) as HTMLButtonElement)
        .disabled,
    ).toBe(false);
  });

  it('reports an unavailable API without pretending that session restoration succeeded', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 503 }));
    render(<AuthenticationPanel />);
    expect((await screen.findByRole('alert')).textContent).toBe(
      'El acceso no está disponible temporalmente.',
    );
    expect(
      (screen.getByLabelText('Correo electrónico') as HTMLInputElement)
        .disabled,
    ).toBe(false);
  });

  it('keeps the current identity when sign-out fails so the user can retry', async () => {
    fetchMock.mockResolvedValueOnce(Response.json(authenticated));
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 503 }));
    render(<AuthenticationPanel />);
    await screen.findByText('Test Admin');
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }));
    await screen.findByRole('alert');
    expect(screen.getByText('Test Admin')).toBeDefined();
    expect(
      (
        screen.getByRole('button', {
          name: 'Cerrar sesión',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false);
  });

  it('aborts session restoration when the panel unmounts', async () => {
    fetchMock.mockImplementationOnce(
      async (_input, options) =>
        new Promise((_resolve, reject) => {
          options?.signal?.addEventListener(
            'abort',
            () => reject(new DOMException('Aborted', 'AbortError')),
            { once: true },
          );
        }),
    );
    const panel = render(<AuthenticationPanel />);
    panel.unmount();
    expect(fetchMock.mock.calls[0]![1]?.signal?.aborted).toBe(true);
  });

  it('toggles password visibility and explains invitation access without issuing extra requests', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 401 }));
    render(<AuthenticationPanel />);
    const toggle = await screen.findByRole('button', {
      name: 'Mostrar contraseña',
    });
    await waitFor(() =>
      expect((toggle as HTMLButtonElement).disabled).toBe(false),
    );
    fireEvent.change(screen.getByLabelText('Contraseña'), {
      target: { value: 'private test phrase' },
    });
    fireEvent.click(toggle);
    expect(screen.getByLabelText('Contraseña').getAttribute('type')).toBe(
      'text',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Ocultar contraseña' }));
    expect(screen.getByLabelText('Contraseña').getAttribute('type')).toBe(
      'password',
    );
    fireEvent.click(
      screen.getByRole('button', { name: '¿Necesitas ayuda para ingresar?' }),
    );
    expect(screen.getByText(/El acceso es por invitación/u)).toBeDefined();
    expect(screen.queryByRole('link', { name: /registro/iu })).toBeNull();
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
