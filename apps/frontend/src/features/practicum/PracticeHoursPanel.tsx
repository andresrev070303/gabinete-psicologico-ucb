import { useCallback, useEffect, useRef, useState } from 'react';
import { listEntries, resumeEntry } from './practicum.api';
import {
  formatDuration,
  formatEntryDate,
  formatEntryTime,
  formatTotalTime,
} from './practicum.presentation';
import {
  usePracticumResource,
  usePracticumMutation,
} from './usePracticumResource';
import { RunningDuration } from './PracticumTimer';
import { usePracticumTimer } from './usePracticumTimer';
import { ActivityDialog } from './ActivityDialog';
import { DeleteTimeEntryDialog } from './DeleteTimeEntryDialog';
import type { Placement, TimeEntry } from './practicum.types';

export function PracticeHoursPanel({
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
    (signal: AbortSignal) => listEntries(placement.id, cursor, signal),
    [placement.id, cursor],
  );
  const resource = usePracticumResource(load);
  const refreshEntries = resource.refresh;
  const timer = usePracticumTimer();
  const [editor, setEditor] = useState<{
    entry: TimeEntry;
    mode: 'edit' | 'delete';
  } | null>(null);
  const action = usePracticumMutation();
  const resumeAttempt = useRef<{ entryId: string; id: string } | null>(null);
  const previousTimer = useRef(timer.state?.entry?.id);
  const canEdit = canTrack && placement.status === 'active';
  const timerId = timer.state?.entry?.id;
  useEffect(() => {
    if (previousTimer.current !== timerId) {
      previousTimer.current = timerId;
      void refreshEntries();
      void onChanged();
    }
  }, [timerId, refreshEntries, onChanged]);
  async function refresh() {
    await resource.refresh();
    await timer.refresh();
    await onChanged();
  }
  async function saved() {
    setEditor(null);
    await refresh();
  }
  function edit(entry: TimeEntry, mode: 'edit' | 'delete') {
    setEditor({ entry, mode });
  }
  async function resume(entry: TimeEntry) {
    if (action.busy || timer.state?.entry || !canTrack || !entry.endedAt)
      return;
    if (resumeAttempt.current?.entryId !== entry.id)
      resumeAttempt.current = { entryId: entry.id, id: crypto.randomUUID() };
    const id = resumeAttempt.current.id;
    await action.run(
      (signal) => resumeEntry(entry.id, id, signal),
      async () => {
        resumeAttempt.current = null;
        await refresh();
      },
    );
  }
  return (
    <section
      className="practice-hours surface-panel"
      aria-label="Registro de horas de práctica"
      aria-busy={resource.busy}
    >
      <div className="practice-section-header">
        <div>
          <h2>Registro de horas</h2>
          <p>Horario de Bolivia</p>
        </div>
        <p className="practice-total" role="status">
          Total de horas:{' '}
          <strong>
            {formatTotalTime(
              resource.data?.totalSeconds ?? placement.totalSeconds,
            )}
          </strong>
        </p>
        <div className="practice-actions">
          <button
            type="button"
            disabled={resource.busy}
            onClick={() => {
              void refresh();
            }}
          >
            Actualizar horas
          </button>
        </div>
      </div>
      {resource.error && <p role="alert">{resource.error}</p>}
      {action.error && <p role="alert">{action.error}</p>}
      {editor?.mode === 'edit' && (
        <ActivityDialog
          key={editor.entry.id}
          mode="edit"
          placement={placement}
          entry={editor.entry}
          onSaved={saved}
          onClose={() => setEditor(null)}
        />
      )}
      {editor?.mode === 'delete' && (
        <DeleteTimeEntryDialog
          key={editor.entry.id}
          entry={editor.entry}
          onSaved={saved}
          onClose={() => setEditor(null)}
        />
      )}
      {resource.busy && !resource.data && (
        <p role="status">Cargando registro de horas…</p>
      )}
      {resource.data?.items.length === 0 && (
        <p className="practice-empty">
          Todavía no hay horas registradas en esta práctica.
        </p>
      )}
      <div className="accounts-table">
        <table>
          <caption>Horas de {placement.studentName}</caption>
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Inicio</th>
              <th>Fin</th>
              <th>Duración</th>
              <th>Proyecto</th>
              <th>Actividad</th>
              {canEdit && <th>Acciones</th>}
            </tr>
          </thead>
          <tbody>
            {resource.data?.items.map((entry) => (
              <tr
                key={entry.id}
                className={entry.voidedAt ? 'practice-entry-voided' : undefined}
              >
                <td>{formatEntryDate(entry.startedAt)}</td>
                <td>{formatEntryTime(entry.startedAt)}</td>
                <td>
                  {entry.endedAt ? (
                    <>
                      <span>{formatEntryTime(entry.endedAt)}</span>
                      {formatEntryDate(entry.startedAt) !==
                        formatEntryDate(entry.endedAt) && (
                        <small>{formatEntryDate(entry.endedAt)}</small>
                      )}
                    </>
                  ) : entry.voidedAt ? (
                    'Sin cierre'
                  ) : (
                    'En curso'
                  )}
                </td>
                <td>
                  {entry.durationSeconds !== null ? (
                    formatDuration(entry.durationSeconds)
                  ) : !entry.voidedAt && resource.data ? (
                    <RunningDuration
                      entryId={entry.id}
                      startedAt={entry.startedAt}
                      serverNow={resource.data.serverNow}
                      receivedAt={resource.receivedAt}
                    />
                  ) : (
                    '—'
                  )}
                </td>
                <td>{entry.projectLabel}</td>
                <td>
                  <strong>{entry.taskTitle}</strong>
                  {entry.description && <p>{entry.description}</p>}
                  {entry.voidedAt && (
                    <span className="practice-voided-label">Anulado</span>
                  )}
                </td>
                {canEdit && (
                  <td>
                    <div className="practice-row-actions">
                      {canEdit && !entry.voidedAt ? (
                        <>
                          <button
                            type="button"
                            disabled={action.busy}
                            onClick={() => edit(entry, 'delete')}
                          >
                            Eliminar
                          </button>
                          <button
                            type="button"
                            disabled={action.busy}
                            onClick={() => edit(entry, 'edit')}
                          >
                            Editar
                          </button>
                          <button
                            type="button"
                            disabled={
                              action.busy ||
                              !canTrack ||
                              !entry.endedAt ||
                              !!timer.state?.entry ||
                              placement.status !== 'active'
                            }
                            title={
                              !canTrack
                                ? 'El cronómetro sólo puede iniciarlo el titular del registro'
                                : undefined
                            }
                            onClick={() => {
                              void resume(entry);
                            }}
                          >
                            Retomar
                          </button>
                        </>
                      ) : (
                        '—'
                      )}
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
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
            Más registros
          </button>
        )}
      </div>
    </section>
  );
}
