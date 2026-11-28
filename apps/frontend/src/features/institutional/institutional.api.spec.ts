// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  getInstitutionalCatalog,
  listRecords,
  getRecord,
  archiveRecord,
} from './institutional.api';
import {
  listNotifications,
  markNotificationRead,
} from '../notifications/notifications.api';
const fetcher = vi.fn<typeof fetch>();
beforeEach(() => {
  vi.stubGlobal('fetch', fetcher);
  vi.stubEnv('VITE_API_URL', '/api');
  fetcher.mockReset();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
it('uses the authenticated same-origin API and serializes list filters', async () => {
  fetcher.mockResolvedValue(Response.json({ items: [], nextCursor: null }));
  await listRecords(
    { type: 'talk', status: 'planned', search: 'Colegio', from: '', to: '' },
    null,
    new AbortController().signal,
  );
  const [url, options] = fetcher.mock.calls[0]!;
  expect(String(url)).toContain('/api/institutional/records?');
  expect(String(url)).toContain('type=talk');
  expect(options?.credentials).toBe('same-origin');
});
it('validates catalog and notification responses and rejects malformed records', async () => {
  fetcher.mockResolvedValueOnce(
    Response.json({
      institutions: [],
      people: [],
      projects: [],
      agreements: [],
    }),
  );
  expect(
    await getInstitutionalCatalog(new AbortController().signal),
  ).toMatchObject({ people: [] });
  fetcher.mockResolvedValueOnce(
    Response.json({ items: [], nextCursor: null, unreadCount: 2 }),
  );
  expect(
    (await listNotifications(null, new AbortController().signal)).unreadCount,
  ).toBe(2);
  fetcher.mockResolvedValueOnce(
    Response.json({ record: { id: 'untrusted' }, team: [], related: [] }),
  );
  await expect(
    getRecord({ id: 'a', kind: 'activity' }, new AbortController().signal),
  ).rejects.toThrow('datos inesperados');
});
it('handles no-content mutations and conveys version conflicts', async () => {
  fetcher.mockResolvedValueOnce(new Response(null, { status: 204 }));
  await expect(
    markNotificationRead('a', new AbortController().signal),
  ).resolves.toBeNull();
  fetcher.mockResolvedValueOnce(
    Response.json({ code: 'version_conflict' }, { status: 409 }),
  );
  await expect(
    archiveRecord(
      { id: 'a', kind: 'activity' },
      { version: 1, reason: 'Duplicate record' },
      new AbortController().signal,
    ),
  ).rejects.toThrow('Actualiza la vista');
});
it('reports expired sessions and inaccessible resources without accepting their response bodies', async () => {
  fetcher.mockResolvedValueOnce(Response.json({}, { status: 401 }));
  await expect(
    listNotifications(null, new AbortController().signal),
  ).rejects.toThrow('Tu sesión venció');
  fetcher.mockResolvedValueOnce(Response.json({}, { status: 404 }));
  await expect(
    getRecord({ id: 'a', kind: 'activity' }, new AbortController().signal),
  ).rejects.toThrow('ya no está disponible');
});
