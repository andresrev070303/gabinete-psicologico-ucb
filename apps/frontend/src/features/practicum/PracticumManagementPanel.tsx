import { useCallback, useState } from 'react';
import type { AuthenticatedIdentity } from '../auth/auth.types';
import { canManagePractice } from './practicum-access';
import {
  createPlacement,
  getPlacement,
  listPlacements,
  listPractitioners,
} from './practicum.api';
import {
  formatTotalTime,
  placementStatusLabels,
} from './practicum.presentation';
import {
  usePracticumMutation,
  usePracticumResource,
} from './usePracticumResource';
import { PlacementForms } from './PlacementForms';
import { PracticeWorkspace } from './PracticeWorkspace';
import { ActivityDialog } from './ActivityDialog';
import type { Placement, Practitioner } from './practicum.types';

export function PracticumManagementPanel({
  identity,
}: {
  identity: AuthenticatedIdentity['identity'];
}) {
  const manage = canManagePractice(identity);
  const [cursor, setCursor] = useState<string | null>(null);
  const [selected, setSelected] = useState<Placement | null>(null);
  const [editing, setEditing] = useState<Placement | null>(null);
  const [assigning, setAssigning] = useState<Placement | 'new' | null>(null);
  const action = usePracticumMutation();
  const load = useCallback(
    async (signal: AbortSignal) => {
      if (manage) return listPractitioners(cursor, signal);
      const page = await listPlacements(cursor, signal);
      return {
        ...page,
        items: page.items.map(({ id, ...profile }) => ({
          ...profile,
          placementId: id,
        })),
      };
    },
    [manage, cursor],
  );
  const resource = usePracticumResource(load);
  async function open(
    person: Practitioner,
    destination: 'hours' | 'assign' | 'state',
  ) {
    await action.run(
      (signal) =>
        person.placementId
          ? getPlacement(person.placementId, signal)
          : createPlacement(
              { studentAccountId: person.studentAccountId },
              signal,
            ),
      (profile) => {
        if (destination === 'assign') setAssigning(profile);
        else if (destination === 'state') setEditing(profile);
        else {
          setSelected(profile);
        }
      },
    );
  }
  if (selected)
    return (
      <div className="practice-feature">
        <div className="practice-toolbar">
          <button
            type="button"
            onClick={() => {
              setSelected(null);
              void resource.refresh();
            }}
          >
            Volver a practicantes
          </button>
        </div>
        <PracticeWorkspace
          key={selected.id}
          placementId={selected.id}
          identity={identity}
          view="hours"
          onChanged={resource.refresh}
        />
      </div>
    );
  return (
    <section className="practice-feature">
      <div className="practice-section-header">
        <div>
          <h2>
            {manage
              ? 'Practicantes del Gabinete'
              : 'Prácticas bajo tu supervisión'}
          </h2>
          <p>
            Consulta las horas por persona, en orden alfabético. No se requiere
            otra inscripción.
          </p>
        </div>
        <div className="practice-actions">
          <button
            type="button"
            disabled={resource.busy}
            onClick={() => {
              void resource.refresh();
            }}
          >
            Actualizar practicantes
          </button>
          {manage && (
            <button
              type="button"
              className="primary-button"
              onClick={() => setAssigning('new')}
            >
              Crear actividad
            </button>
          )}
        </div>
      </div>
      {resource.error && <p role="alert">{resource.error}</p>}
      {action.error && <p role="alert">{action.error}</p>}
      {editing && (
        <PlacementForms
          placement={editing}
          onSaved={resource.refresh}
          onCancel={() => setEditing(null)}
        />
      )}
      {assigning && (
        <ActivityDialog
          mode="assign"
          placement={assigning === 'new' ? undefined : assigning}
          onClose={() => setAssigning(null)}
          onSaved={async () => {
            await resource.refresh();
            setAssigning(null);
          }}
        />
      )}
      <div className="surface-panel">
        <div className="accounts-table">
          <table>
            <caption>Practicantes del Gabinete</caption>
            <thead>
              <tr>
                <th>Practicante</th>
                <th>Estado</th>
                <th>Total de horas</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {resource.data?.items.map((person) => (
                <tr key={person.studentAccountId}>
                  <td>
                    <strong>{person.studentName}</strong>
                    <p>{person.studentEmail}</p>
                  </td>
                  <td>
                    {placementStatusLabels[person.status]}
                    {person.hasRunningTimer && (
                      <small className="practice-running-label">
                        Cronómetro en curso
                      </small>
                    )}
                  </td>
                  <td className="practice-list-total">
                    {formatTotalTime(person.totalSeconds)}
                  </td>
                  <td>
                    <div className="practice-row-actions">
                      <button
                        type="button"
                        disabled={action.busy}
                        onClick={() => {
                          void open(person, 'hours');
                        }}
                      >
                        Ver horas
                      </button>
                      {manage && (
                        <>
                          <button
                            type="button"
                            disabled={
                              action.busy || person.status === 'completed'
                            }
                            onClick={() => {
                              void open(person, 'assign');
                            }}
                          >
                            Asignar actividad
                          </button>
                          <button
                            type="button"
                            disabled={action.busy}
                            onClick={() => {
                              void open(person, 'state');
                            }}
                          >
                            Cambiar estado
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {resource.busy && !resource.data && (
          <p role="status">Cargando practicantes…</p>
        )}
        {resource.data?.items.length === 0 && (
          <p className="practice-empty">
            Todavía no hay cuentas de practicantes en tu ámbito.
          </p>
        )}
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
              Más practicantes
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
