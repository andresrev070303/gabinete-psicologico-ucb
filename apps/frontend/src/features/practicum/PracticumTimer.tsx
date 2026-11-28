import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Icon } from '../../components/Icon';
import type { AuthenticatedIdentity } from '../auth/auth.types';
import { canTrackPractice } from './practicum-access';
import { getRunningTimer, stopTimer } from './practicum.api';
import { formatDuration } from './practicum.presentation';
import {
  usePracticumMutation,
  usePracticumResource,
} from './usePracticumResource';
import { PracticumTimerContext, usePracticumTimer } from './usePracticumTimer';
export function PracticumTimerProvider({
  identity,
  children,
}: {
  identity: AuthenticatedIdentity['identity'];
  children: ReactNode;
}) {
  const load = useCallback(
    (signal: AbortSignal) => getRunningTimer(signal),
    [],
  );
  const resource = usePracticumResource(load, canTrackPractice(identity));
  const action = usePracticumMutation();
  const locked = useRef(false);
  const [stopState, setStopState] = useState<{
    entryId: string;
    endedAt: string;
    confirmed: boolean;
  } | null>(null);
  async function stop() {
    const entry = resource.data?.entry;
    if (
      !entry ||
      locked.current ||
      (stopState?.entryId === entry.id && stopState.confirmed)
    )
      return;
    locked.current = true;
    const offset = Date.parse(resource.data!.serverNow) - resource.receivedAt;
    const endedAt = new Date(
      Math.max(Date.parse(entry.startedAt), Date.now() + offset),
    ).toISOString();
    setStopState({ entryId: entry.id, endedAt, confirmed: false });
    try {
      const saved = await action.run(
        (signal) => stopTimer(entry.id, signal, endedAt),
        async (result) => {
          setStopState({
            entryId: entry.id,
            endedAt: result.endedAt!,
            confirmed: true,
          });
          await resource.refresh();
        },
      );
      if (!saved) {
        setStopState(null);
        await resource.refresh();
      }
    } finally {
      locked.current = false;
    }
  }
  const state =
    resource.data &&
    stopState?.confirmed &&
    resource.data.entry?.id === stopState.entryId
      ? { ...resource.data, entry: null }
      : resource.data;
  return (
    <PracticumTimerContext.Provider
      value={{
        state,
        receivedAt: resource.receivedAt,
        busy: resource.busy,
        error: resource.error,
        refresh: resource.refresh,
        stopping: action.busy,
        stopError: action.error,
        stop,
        stopState,
      }}
    >
      {children}
    </PracticumTimerContext.Provider>
  );
}
export function RunningDuration({
  startedAt,
  serverNow,
  entryId,
  receivedAt,
}: {
  startedAt: string;
  serverNow: string;
  entryId?: string;
  receivedAt: number;
}) {
  const timer = usePracticumTimer();
  const frozenAt =
    timer.stopState && timer.stopState.entryId === entryId
      ? timer.stopState.endedAt
      : null;
  const [now, setNow] = useState(Date.now);
  const offset = Date.parse(serverNow) - receivedAt;
  useEffect(() => {
    if (frozenAt) return;
    const tick = () => setNow(Date.now());
    tick();
    const interval = window.setInterval(tick, 1000);
    return () => window.clearInterval(interval);
  }, [frozenAt, serverNow, receivedAt]);
  return (
    <span className="timer-digits" aria-label="Tiempo transcurrido">
      {formatDuration(
        ((frozenAt ? Date.parse(frozenAt) : now + offset) -
          Date.parse(startedAt)) /
          1000,
      )}
    </span>
  );
}
export function PracticumTimerBar() {
  const timer = usePracticumTimer();
  const entry = timer.state?.entry;
  if (!entry)
    return timer.error || timer.stopError ? (
      <p className="practice-timer-feedback" role="alert">
        {timer.stopError ?? timer.error}{' '}
        <button
          type="button"
          onClick={() => {
            void timer.refresh();
          }}
        >
          Reintentar cronómetro
        </button>
      </p>
    ) : null;
  return (
    <section className="practice-timer-bar" aria-label="Cronómetro de práctica">
      <div>
        <span className="timer-live-dot" aria-hidden="true" />
        <strong>{entry.taskTitle}</strong>
        <span className="timer-project">{entry.projectLabel}</span>
      </div>
      <div>
        <RunningDuration
          key={entry.id}
          entryId={entry.id}
          startedAt={entry.startedAt}
          serverNow={timer.state!.serverNow}
          receivedAt={timer.receivedAt}
        />
        <button
          type="button"
          disabled={timer.stopping}
          onClick={() => {
            void timer.stop();
          }}
        >
          <Icon name="clock" />
          {timer.stopping ? 'Deteniendo…' : 'Detener'}
        </button>
      </div>
      {timer.stopError && (
        <p role="alert">
          {timer.stopError} No se confirmó la detención. Verifica la conexión y
          vuelve a pulsar Detener.
        </p>
      )}
    </section>
  );
}
