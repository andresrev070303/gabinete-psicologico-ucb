import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getRunningTimer,
  listEntries,
  listOwnPlacements,
  listPlacements,
  stopTimer,
} from './practicum.api';
describe('Practice API client', () => {
  const fetcher = vi.fn<typeof fetch>();
  beforeEach(() => {
    fetcher.mockReset();
    vi.stubGlobal('fetch', fetcher);
    vi.stubGlobal('location', { origin: 'https://web.example.test' });
    vi.stubEnv('VITE_API_URL', '/api');
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });
  it('requests only own placements for the personal workspace and preserves same-origin cookies', async () => {
    fetcher.mockResolvedValueOnce(
      Response.json({ items: [], nextCursor: null }),
    );
    await listOwnPlacements(null, new AbortController().signal);
    expect(String(fetcher.mock.calls[0]![0])).toContain(
      '/api/practicum/my-placements?limit=20',
    );
    expect(fetcher.mock.calls[0]![1]?.credentials).toBe('same-origin');
  });
  it('safely encodes a cursor instead of constructing an unscoped target-account query', async () => {
    fetcher.mockResolvedValueOnce(
      Response.json({ items: [], nextCursor: null }),
    );
    await listPlacements('cursor-value', new AbortController().signal);
    expect(
      new URL(String(fetcher.mock.calls[0]![0])).searchParams.get('cursor'),
    ).toBe('cursor-value');
  });
  it.each([
    ['overlap', 'se superpone'],
    ['timer_running', 'cronómetro en curso'],
    ['version_conflict', 'Actualiza la vista'],
  ])(
    'translates %s without exposing server details',
    async (code, expected) => {
      fetcher.mockResolvedValueOnce(
        Response.json(
          { code, message: 'private database detail' },
          { status: 409 },
        ),
      );
      await expect(
        stopTimer('entry', new AbortController().signal),
      ).rejects.toThrow(expected);
    },
  );
  it('rejects malformed totals and timer state', async () => {
    fetcher.mockResolvedValueOnce(
      Response.json({
        items: [],
        nextCursor: null,
        totalSeconds: '5700',
        entryCount: 0,
        serverNow: '2026-11-27T10:00:00Z',
      }),
    );
    await expect(
      listEntries('placement', null, new AbortController().signal),
    ).rejects.toThrow('inesperados');
    fetcher.mockResolvedValueOnce(
      Response.json({
        entry: { passwordHash: 'private' },
        serverNow: 'invalid',
      }),
    );
    await expect(getRunningTimer(new AbortController().signal)).rejects.toThrow(
      'inesperados',
    );
  });
  it('sends only the captured stop timestamp with the current session', async () => {
    fetcher.mockResolvedValueOnce(
      Response.json({ code: 'invalid_period' }, { status: 409 }),
    );
    await expect(
      stopTimer('entry', new AbortController().signal, '2026-11-27T10:00:00Z'),
    ).rejects.toThrow();
    expect(JSON.parse(fetcher.mock.calls[0]![1]!.body as string)).toEqual({
      stoppedAt: '2026-11-27T10:00:00Z',
    });
  });
});
