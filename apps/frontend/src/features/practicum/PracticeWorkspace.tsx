import { useCallback, useId, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import type { AuthenticatedIdentity } from '../auth/auth.types';
import { canTrackPractice } from './practicum-access';
import { getPlacement } from './practicum.api';
import { placementStatusLabels } from './practicum.presentation';
import { usePracticumResource } from './usePracticumResource';
import { PracticeHoursPanel } from './PracticeHoursPanel';
import { PracticeTasksPanel } from './PracticeTasksPanel';
import { ActivityDialog } from './ActivityDialog';
import { usePracticumTimer } from './usePracticumTimer';
export type PracticeView = 'summary' | 'tasks' | 'hours';
type WorkspaceTab = 'activities' | 'hours';

export function PracticeWorkspace({
  placementId,
  identity,
  onChanged,
}: {
  placementId: string;
  identity: AuthenticatedIdentity['identity'];
  view: PracticeView;
  onChanged?: () => Promise<void>;
}) {
  const [activityOpen, setActivityOpen] = useState(false);
  const [tab, setTab] = useState<WorkspaceTab>('activities');
  const id = useId();
  const activitiesTab = useRef<HTMLButtonElement>(null);
  const hoursTab = useRef<HTMLButtonElement>(null);
  const timer = usePracticumTimer();
  const load = useCallback(
    (signal: AbortSignal) => getPlacement(placementId, signal),
    [placementId],
  );
  const resource = usePracticumResource(load);
  const refreshPlacement = resource.refresh;
  const reload = useCallback(async () => {
    await refreshPlacement();
    await onChanged?.();
  }, [refreshPlacement, onChanged]);
  const placement = resource.data;
  function navigateTabs(event: KeyboardEvent<HTMLButtonElement>) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const next =
      event.key === 'Home'
        ? 'activities'
        : event.key === 'End'
          ? 'hours'
          : tab === 'activities'
            ? 'hours'
            : 'activities';
    setTab(next);
    (next === 'activities' ? activitiesTab : hoursTab).current?.focus();
  }
  if (!placement)
    return (
      <section className="surface-panel">
        {resource.error ? (
          <>
            <p role="alert">{resource.error}</p>
            <button
              type="button"
              onClick={() => {
                void resource.refresh();
              }}
            >
              Reintentar práctica
            </button>
          </>
        ) : (
          <p role="status">Cargando práctica…</p>
        )}
      </section>
    );
  const ownProfile = placement.studentAccountId === identity.accountId;
  const canTrack = canTrackPractice(identity) && ownProfile;
  return (
    <div className="practice-workspace">
      {resource.error && <p role="alert">{resource.error}</p>}
      {!ownProfile && (
        <section
          className="practice-summary surface-panel"
          aria-label="Datos de la práctica"
        >
          <div>
            <span className="eyebrow">Registro de prácticas</span>
            <h2>{placement.studentName}</h2>
            <p>{placement.studentEmail}</p>
          </div>
          <span className="role-badge">
            {placementStatusLabels[placement.status]}
          </span>
        </section>
      )}
      {ownProfile && placement.status === 'completed' && (
        <p className="surface-panel" role="status">
          <strong>Finalizada</strong> · Puedes consultar tus actividades y
          horas.
        </p>
      )}
      {ownProfile && (
        <div className="practice-workspace-toolbar">
          <div
            className="practice-tabs"
            role="tablist"
            aria-label="Actividades y registro de horas"
          >
            <button
              ref={activitiesTab}
              id={id + '-activities-tab'}
              type="button"
              role="tab"
              aria-selected={tab === 'activities'}
              aria-controls={id + '-activities-panel'}
              tabIndex={tab === 'activities' ? 0 : -1}
              onKeyDown={navigateTabs}
              onClick={() => setTab('activities')}
            >
              Actividades
            </button>
            <button
              ref={hoursTab}
              id={id + '-hours-tab'}
              type="button"
              role="tab"
              aria-selected={tab === 'hours'}
              aria-controls={id + '-hours-panel'}
              tabIndex={tab === 'hours' ? 0 : -1}
              onKeyDown={navigateTabs}
              onClick={() => setTab('hours')}
            >
              Registro de horas
            </button>
          </div>
          {canTrack && placement.status === 'active' && (
            <div
              className="practice-actions"
              role="group"
              aria-label="Registrar trabajo"
            >
              <button
                type="button"
                className="primary-button"
                onClick={() => setActivityOpen(true)}
              >
                Crear
              </button>
              {timer.state?.entry ? (
                <button type="button" onClick={() => setTab('activities')}>
                  Ver actividad en curso
                </button>
              ) : (
                <button
                  type="button"
                  className="practice-play-button"
                  aria-label="Iniciar cronómetro"
                  onClick={() => setActivityOpen(true)}
                >
                  <span aria-hidden="true">▶</span> Iniciar
                </button>
              )}
            </div>
          )}
        </div>
      )}
      {activityOpen && (
        <ActivityDialog
          mode="own"
          placement={placement}
          timerRunning={!!timer.state?.entry}
          onSaved={async () => {
            await timer.refresh();
            await reload();
            setActivityOpen(false);
            setTab('activities');
          }}
          onClose={() => setActivityOpen(false)}
        />
      )}
      {ownProfile ? (
        <>
          {tab === 'activities' && (
            <div
              id={id + '-activities-panel'}
              role="tabpanel"
              aria-labelledby={id + '-activities-tab'}
              tabIndex={0}
            >
              <PracticeTasksPanel
                placement={placement}
                canTrack={canTrack}
                onChanged={reload}
              />
            </div>
          )}
          {tab === 'hours' && (
            <div
              id={id + '-hours-panel'}
              role="tabpanel"
              aria-labelledby={id + '-hours-tab'}
              tabIndex={0}
            >
              <PracticeHoursPanel
                placement={placement}
                canTrack={canTrack}
                onChanged={reload}
              />
            </div>
          )}
        </>
      ) : (
        <PracticeHoursPanel
          placement={placement}
          canTrack={false}
          onChanged={reload}
        />
      )}
    </div>
  );
}
