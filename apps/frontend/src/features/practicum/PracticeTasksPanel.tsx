import { useCallback, useEffect, useRef, useState } from 'react';
import { listTasks, startTimer } from './practicum.api';
import {
  usePracticumMutation,
  usePracticumResource,
} from './usePracticumResource';
import { RunningDuration } from './PracticumTimer';
import { usePracticumTimer } from './usePracticumTimer';
import type { Placement, PracticeTask } from './practicum.types';

export function PracticeTasksPanel({
  placement,
  canTrack,
  onChanged,
}: {
  placement: Placement;
  canTrack: boolean;
  onChanged: () => Promise<void>;
}) {
  const [cursor, setCursor] = useState<string | null>(null);
  const load = useCallback(
    (signal: AbortSignal) => listTasks(placement.id, cursor, signal),
    [placement, cursor],
  );
  const resource = usePracticumResource(load);
  const timer = usePracticumTimer();
  const timerId = timer.state?.entry?.id;
  const previousTimer = useRef(timerId);
  const refreshActivities = resource.refresh;
  useEffect(() => {
    if (previousTimer.current !== timerId) {
      previousTimer.current = timerId;
      void refreshActivities();
    }
  }, [timerId, refreshActivities]);
  const action = usePracticumMutation();
  const attempt = useRef<{ taskId: string; entryId: string } | null>(null);
  async function resume(task: PracticeTask) {
    if (action.busy || timer.state?.entry || placement.status !== 'active')
      return;
    if (attempt.current?.taskId !== task.id)
      attempt.current = { taskId: task.id, entryId: crypto.randomUUID() };
    const id = attempt.current.entryId;
    await action.run(
      (signal) =>
        startTimer(
          placement.id,
          { id, taskId: task.id, description: task.description },
          signal,
        ),
      async () => {
        attempt.current = null;
        await timer.refresh();
        await onChanged();
      },
    );
  }
  const running =
    canTrack && timer.state?.entry?.placementId === placement.id
      ? timer.state.entry
      : null;
  const currentTask = running
    ? {
        ...resource.data?.items.find((task) => task.id === running.taskId),
        id: running.taskId ?? running.id,
        placementId: placement.id,
        title: running.taskTitle,
        projectLabel: running.projectLabel,
        description: running.description,
        activityKind: 'other' as const,
        status: 'active' as const,
        version: 1,
        createdByAccountId: null,
        assignedByDirector:
          resource.data?.items.some(
            (task) => task.id === running.taskId && task.assignedByDirector,
          ) ?? false,
      }
    : null;
  const visibleTasks = currentTask
    ? [
        currentTask,
        ...(resource.data?.items ?? []).filter(
          (task) => task.id !== currentTask.id,
        ),
      ]
    : (resource.data?.items ?? []);
  return (
    <section
      className="practice-tasks surface-panel"
      aria-label="Actividades de la práctica"
      aria-busy={resource.busy}
    >
      <div className="practice-section-header">
        <div>
          <h2>Actividades</h2>
          <p>
            Retoma una actividad para iniciar un nuevo intervalo de trabajo.
          </p>
        </div>
        <button
          type="button"
          disabled={resource.busy}
          onClick={() => {
            setCursor(null);
            void resource.refresh();
          }}
        >
          Actualizar actividades
        </button>
      </div>
      {resource.error && <p role="alert">{resource.error}</p>}
      {action.error && <p role="alert">{action.error}</p>}
      {resource.busy && !resource.data && (
        <p role="status">Cargando actividades…</p>
      )}
      {resource.data && visibleTasks.length === 0 && (
        <p className="practice-empty">
          Todavía no hay actividades. Usa Crear para empezar.
        </p>
      )}
      <div className="practice-task-grid">
        {visibleTasks.map((task) => {
          const inProgress =
            running && (running.taskId ?? running.id) === task.id;
          return (
            <article
              className={
                'practice-task-card' +
                (inProgress ? ' practice-task-card--running' : '')
              }
              key={task.id}
              aria-label={'Actividad: ' + task.title}
            >
              <div className="practice-task-content">
                <div className="practice-task-card-heading">
                  <h3>{task.title}</h3>
                  {inProgress && (
                    <span className="practice-live-label">En curso</span>
                  )}
                </div>
                <p className="practice-project-label">{task.projectLabel}</p>
                {task.description && (
                  <p className="practice-task-description">
                    {task.description}
                  </p>
                )}
                {task.assignedByDirector && (
                  <p className="practice-assigned-label">
                    Asignada por el Director
                  </p>
                )}
              </div>
              <div className="practice-task-controls">
                {inProgress ? (
                  <>
                    <RunningDuration
                      entryId={running.id}
                      startedAt={running.startedAt}
                      serverNow={timer.state!.serverNow}
                      receivedAt={timer.receivedAt}
                    />
                    <button
                      type="button"
                      className="practice-stop-button"
                      aria-label={'Detener actividad ' + task.title}
                      disabled={timer.stopping}
                      onClick={() => {
                        void timer.stop();
                      }}
                    >
                      <span aria-hidden="true">■</span>{' '}
                      {timer.stopping ? 'Deteniendo…' : 'Detener'}
                    </button>
                  </>
                ) : (
                  canTrack &&
                  placement.status === 'active' &&
                  task.status === 'active' && (
                    <button
                      type="button"
                      disabled={action.busy || !!timer.state?.entry}
                      onClick={() => {
                        void resume(task);
                      }}
                    >
                      <span aria-hidden="true">▶</span> Retomar tarea
                    </button>
                  )
                )}
              </div>
            </article>
          );
        })}
      </div>
      <div className="practice-pagination">
        {cursor && (
          <button
            type="button"
            disabled={resource.busy}
            onClick={() => setCursor(null)}
          >
            Primera página
          </button>
        )}
        {resource.data?.nextCursor && (
          <button
            type="button"
            disabled={resource.busy}
            onClick={() => setCursor(resource.data!.nextCursor)}
          >
            Más actividades
          </button>
        )}
      </div>
    </section>
  );
}
