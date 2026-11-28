// @vitest-environment happy-dom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  PracticumTimerBar,
  PracticumTimerProvider,
  RunningDuration,
} from './PracticumTimer';
import type { TimeEntry } from './practicum.types';

const identity = {
  accountId: 'student',
  givenNames: 'Test',
  familyNames: 'Student',
  email: 'test@example.test',
  roles: ['assistant'],
  permissions: ['practicum.read_own', 'practicum.track_own'],
};
const entry: TimeEntry = {
  id: 'entry',
  placementId: 'placement',
  taskId: 'task',
  taskTitle: 'Registros',
  projectLabel: 'Gabinete',
  activityKind: 'other',
  description: null,
  startedAt: '2026-11-27T09:59:00.000Z',
  endedAt: null,
  durationSeconds: null,
  source: 'timer',
  version: 1,
  voidedAt: null,
};
const fetcher = vi.fn<typeof fetch>();
let resolveStop: (response: Response) => void;
let running: TimeEntry | null;
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-27T10:00:00.000Z'));
  vi.stubEnv('VITE_API_URL', '/api');
  running = entry;
  fetcher.mockReset().mockImplementation(async (input) => {
    if (String(input).includes('/stop'))
      return new Promise((resolve) => {
        resolveStop = resolve;
      });
    return Response.json({
      entry: running,
      serverNow: new Date().toISOString(),
    });
  });
  vi.stubGlobal('fetch', fetcher);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
async function openTimer() {
  await act(async () => {
    render(
      <PracticumTimerProvider identity={identity}>
        <PracticumTimerBar />
        <RunningDuration
          entryId={entry.id}
          startedAt={entry.startedAt}
          serverNow="2026-11-27T10:00:00.000Z"
          receivedAt={Date.parse('2026-11-27T10:00:00.000Z')}
        />
      </PracticumTimerProvider>,
    );
  });
}
it('freezes both counters at the click while a slow stop request is pending and prevents duplicate requests', async () => {
  await openTimer();
  await act(async () => {
    vi.advanceTimersByTime(2000);
  });
  expect(
    screen
      .getAllByLabelText('Tiempo transcurrido')
      .map((item) => item.textContent),
  ).toEqual(['00:01:02', '00:01:02']);
  fireEvent.click(screen.getByRole('button', { name: 'Detener' }));
  fireEvent.click(screen.getByRole('button', { name: 'Deteniendo…' }));
  await act(async () => {
    vi.advanceTimersByTime(10000);
  });
  expect(
    screen
      .getAllByLabelText('Tiempo transcurrido')
      .map((item) => item.textContent),
  ).toEqual(['00:01:02', '00:01:02']);
  const calls = fetcher.mock.calls.filter(([input]) =>
    String(input).includes('/stop'),
  );
  expect(calls).toHaveLength(1);
  expect(JSON.parse(calls[0][1]!.body as string)).toEqual({
    stoppedAt: '2026-11-27T10:00:02.000Z',
  });
  running = null;
  await act(async () => {
    resolveStop(
      Response.json({
        ...entry,
        endedAt: '2026-11-27T10:00:02.000Z',
        durationSeconds: 62,
        version: 2,
      }),
    );
  });
  expect(
    screen.queryByRole('region', { name: 'Cronómetro de práctica' }),
  ).toBeNull();
  await act(async () => {
    vi.advanceTimersByTime(10000);
  });
  expect(screen.getByLabelText('Tiempo transcurrido').textContent).toBe(
    '00:01:02',
  );
});
it('shows a failed stop and restores the running clock instead of claiming it was saved', async () => {
  await openTimer();
  fireEvent.click(screen.getByRole('button', { name: 'Detener' }));
  await act(async () => {
    vi.advanceTimersByTime(10000);
    resolveStop(Response.json({ code: 'unavailable' }, { status: 503 }));
  });
  expect(screen.getByRole('alert').textContent).toContain(
    'No se confirmó la detención',
  );
  expect(screen.getByRole('button', { name: 'Detener' })).toBeDefined();
  await act(async () => {
    vi.advanceTimersByTime(2000);
  });
  expect(screen.getAllByLabelText('Tiempo transcurrido')[0].textContent).toBe(
    '00:01:12',
  );
});

it('keeps elapsed time when an activity counter is mounted after navigation', async () => {
  const view = (show: boolean) => (
    <PracticumTimerProvider identity={identity}>
      <PracticumTimerBar />
      {show && (
        <RunningDuration
          entryId={entry.id}
          startedAt={entry.startedAt}
          serverNow="2026-11-27T10:00:00.000Z"
          receivedAt={Date.parse('2026-11-27T10:00:00.000Z')}
        />
      )}
    </PracticumTimerProvider>
  );
  const result = render(view(false));
  await act(async () => {});
  await act(async () => {
    vi.advanceTimersByTime(12000);
  });
  result.rerender(view(true));
  expect(
    screen
      .getAllByLabelText('Tiempo transcurrido')
      .map((element) => element.textContent),
  ).toEqual(['00:01:12', '00:01:12']);
});
