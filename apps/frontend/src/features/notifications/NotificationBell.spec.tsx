// @vitest-environment happy-dom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { NotificationBell } from './NotificationBell';
import * as api from './notifications.api';
vi.mock('./notifications.api');
const notification = {
  id: 'notification',
  resourceKind: 'activity' as const,
  resourceId: 'activity',
  resourceType: 'talk',
  resourceTitle: 'Orientación vocacional',
  actorName: 'Carla Espada',
  createdAt: '2026-11-27T12:00:00Z',
  readAt: null,
};
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.listNotifications).mockResolvedValue({
    items: [notification],
    nextCursor: null,
    unreadCount: 1,
  });
  vi.mocked(api.markNotificationRead).mockResolvedValue(null);
});
afterEach(cleanup);
it('shows personal assignment notifications and marks only the selected item before opening its record', async () => {
  const open = vi.fn();
  render(<NotificationBell onOpen={open} />);
  fireEvent.click(
    await screen.findByRole('button', { name: 'Notificaciones, 1 sin leer' }),
  );
  expect(await screen.findByText('Carla Espada')).toBeDefined();
  expect(screen.getByText(/te añadió a charla/u)).toBeDefined();
  fireEvent.click(screen.getByRole('button', { name: 'Ver registro' }));
  await waitFor(() =>
    expect(api.markNotificationRead).toHaveBeenCalledWith(
      'notification',
      expect.any(AbortSignal),
    ),
  );
  expect(open).toHaveBeenCalledWith({ kind: 'activity', id: 'activity' });
});
it('keeps a failed read operation visible without discarding its notification', async () => {
  vi.mocked(api.markNotificationRead).mockRejectedValue(
    new Error('No se pudo confirmar la lectura.'),
  );
  const open = vi.fn();
  render(<NotificationBell onOpen={open} />);
  fireEvent.click(
    await screen.findByRole('button', { name: 'Notificaciones, 1 sin leer' }),
  );
  fireEvent.click(await screen.findByRole('button', { name: 'Ver registro' }));
  expect(await screen.findByRole('alert')).toBeDefined();
  expect(open).not.toHaveBeenCalled();
});
