import { useCallback } from 'react';
import type { AuthenticatedIdentity } from '../auth/auth.types';
import { canTrackPractice } from './practicum-access';
import { initializeOwnPlacement, listOwnPlacements } from './practicum.api';
import { usePracticumResource } from './usePracticumResource';
import { PracticeWorkspace } from './PracticeWorkspace';
import type { PracticeView } from './PracticeWorkspace';

export function PracticumPersonalPanel({
  identity,
  view,
}: {
  identity: AuthenticatedIdentity['identity'];
  view: PracticeView;
}) {
  const tracking = canTrackPractice(identity);
  const load = useCallback(
    async (signal: AbortSignal) =>
      tracking
        ? initializeOwnPlacement(signal)
        : ((await listOwnPlacements(null, signal)).items.find(
            (item) => item.studentAccountId === identity.accountId,
          ) ?? null),
    [tracking, identity.accountId],
  );
  const resource = usePracticumResource(load);
  return (
    <div className="practice-feature">
      {resource.error && <p role="alert">{resource.error}</p>}
      {resource.busy && !resource.data && (
        <p role="status">Preparando tus horas…</p>
      )}
      {!resource.busy && !resource.data && !resource.error && (
        <p className="surface-panel">
          Tu cuenta tiene acceso de consulta y todavía no hay horas registradas.
        </p>
      )}
      {resource.data && (
        <PracticeWorkspace
          key={resource.data.id + '-' + view}
          placementId={resource.data.id}
          identity={identity}
          view={view}
          onChanged={resource.refresh}
        />
      )}
      {(resource.error || !resource.data) && (
        <button
          type="button"
          disabled={resource.busy}
          onClick={() => {
            void resource.refresh();
          }}
        >
          Reintentar
        </button>
      )}
    </div>
  );
}
