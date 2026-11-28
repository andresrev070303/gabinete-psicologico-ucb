import { useCallback, useState } from 'react';
import { useAsyncResource } from '../../lib/useAsyncResource';
import { getRecord } from './institutional.api';
import {
  formatRecordDate,
  recordStatus,
  scheduledDuration,
  terminal,
  editable,
  typeLabels,
} from './institutional.presentation';
import { RecordDialog } from './RecordDialog';
import { RecordActionDialog } from './RecordActionDialog';
import type { RecordAction } from './RecordActionDialog';
import type { RecordKey } from './institutional.types';
export function RecordDetailsPanel({
  recordKey,
  canManage,
  accountId,
  onBack,
  onOpen,
  onChanged,
}: {
  recordKey: RecordKey;
  canManage: boolean;
  accountId: string;
  onBack: () => void;
  onOpen: (key: RecordKey) => void;
  onChanged: () => Promise<void>;
}) {
  const load = useCallback(
    (signal: AbortSignal) => getRecord(recordKey, signal),
    [recordKey],
  );
  const resource = useAsyncResource(load);
  const [editing, setEditing] = useState(false),
    [action, setAction] = useState<RecordAction | null>(null);
  const details =
    resource.data?.record.id === recordKey.id &&
    resource.data.record.kind === recordKey.kind
      ? resource.data
      : null;
  const record = details?.record;
  const actions: RecordAction[] =
    !record || terminal(record)
      ? []
      : record.kind === 'activity'
        ? [{ status: 'completed', label: 'Finalizar' }]
        : record.kind === 'agreement'
          ? [
              ...(record.status === 'draft'
                ? [{ status: 'active', label: 'Activar convenio' }]
                : []),
              { status: 'closed', label: 'Finalizar convenio' },
            ]
          : [
              ...(record.status === 'planned'
                ? [{ status: 'active', label: 'Iniciar proyecto' }]
                : []),
              { status: 'completed', label: 'Finalizar proyecto' },
            ];
  async function saved() {
    setAction(null);
    setEditing(false);
    await resource.refresh();
    await onChanged();
  }
  return (
    <div className="institutional-details">
      <div className="institutional-toolbar">
        <button type="button" onClick={onBack}>
          ← Volver a la lista
        </button>
        <button
          type="button"
          disabled={resource.busy}
          onClick={() => {
            void resource.refresh();
          }}
        >
          Actualizar
        </button>
      </div>
      {resource.busy && <p role="status">Cargando registro…</p>}
      {resource.error && (
        <p className="feedback" role="alert">
          {resource.error}
        </p>
      )}
      {record && details && (
        <>
          <section className="surface-panel institutional-overview">
            <div className="institutional-title-row">
              <div>
                <span className="eyebrow">{typeLabels[record.type]}</span>
                <h2>{record.title}</h2>
              </div>
              <span className="role-badge">{recordStatus(record)}</span>
            </div>
            <p className="institutional-description">
              {record.description || 'Sin descripción adicional.'}
            </p>
            <dl className="institutional-facts">
              <div>
                <dt>
                  {record.kind === 'activity' ? 'Inicio' : 'Inicio de vigencia'}
                </dt>
                <dd>{formatRecordDate(record.startsAt, record.kind)}</dd>
              </div>
              <div>
                <dt>
                  {record.kind === 'activity' ? 'Fin' : 'Fin de vigencia'}
                </dt>
                <dd>
                  {record.endsAt
                    ? formatRecordDate(record.endsAt, record.kind)
                    : 'Sin fecha definida'}
                </dd>
              </div>
              {record.kind === 'activity' && (
                <div>
                  <dt>Duración programada</dt>
                  <dd>
                    {scheduledDuration(record.startsAt, record.endsAt) ||
                      'Sin duración definida'}
                  </dd>
                </div>
              )}
              <div>
                <dt>Responsable</dt>
                <dd>{record.responsibleName || 'Sin responsable'}</dd>
              </div>
              <div>
                <dt>Institución</dt>
                <dd>{record.institutionName || 'Sin institución vinculada'}</dd>
              </div>
              {record.venue && (
                <div>
                  <dt>Lugar</dt>
                  <dd>{record.venue}</dd>
                </div>
              )}
              {record.code && (
                <div>
                  <dt>Código</dt>
                  <dd>{record.code}</dd>
                </div>
              )}
              {record.projectId && (
                <div>
                  <dt>Proyecto</dt>
                  <dd>
                    <button
                      type="button"
                      className="institutional-text-button"
                      onClick={() =>
                        onOpen({ kind: 'project', id: record.projectId! })
                      }
                    >
                      {record.projectName}
                    </button>
                  </dd>
                </div>
              )}
              {record.agreementId && (
                <div>
                  <dt>Convenio</dt>
                  <dd>
                    <button
                      type="button"
                      className="institutional-text-button"
                      onClick={() =>
                        onOpen({ kind: 'agreement', id: record.agreementId! })
                      }
                    >
                      {record.agreementName}
                    </button>
                  </dd>
                </div>
              )}
            </dl>
            {canManage && (
              <div className="institutional-actions">
                {actions.map((item) => (
                  <button
                    type="button"
                    key={item.status}
                    onClick={() => setAction(item)}
                  >
                    {item.label}
                  </button>
                ))}
                {editable(record) && (
                  <button type="button" onClick={() => setEditing(true)}>
                    Editar
                  </button>
                )}
                <button
                  type="button"
                  className="institutional-danger"
                  onClick={() =>
                    setAction({ status: 'archive', label: 'Eliminar registro' })
                  }
                >
                  Eliminar
                </button>
              </div>
            )}
          </section>
          <section className="surface-panel">
            <h2>Equipo participante</h2>
            <ul className="institutional-team-list">
              {details.team.map((member) => (
                <li key={member.accountId}>
                  <span>{member.name}</span>
                  {member.accountId === record.responsibleAccountId && (
                    <span className="role-badge">Responsable</span>
                  )}
                </li>
              ))}
            </ul>
            {!details.team.length && <p>No hay personas asignadas.</p>}
          </section>
          {record.results !== null && (
            <section className="surface-panel">
              <h2>Resultados</h2>
              <p className="institutional-description">{record.results}</p>
              <p>
                <strong>{record.reportedParticipants ?? 0}</strong> asistentes o
                beneficiarios registrados.
              </p>
            </section>
          )}
          {record.kind !== 'activity' && (
            <section className="surface-panel">
              <h2>Actividades vinculadas</h2>
              {details.related.length ? (
                <ul className="institutional-related">
                  {details.related.map((item) => (
                    <li key={item.id}>
                      <button type="button" onClick={() => onOpen(item)}>
                        {item.title}
                      </button>
                      <span>
                        {typeLabels[item.type]} ·{' '}
                        {formatRecordDate(item.startsAt, item.kind)}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p>No hay actividades vinculadas disponibles para tu cuenta.</p>
              )}
            </section>
          )}
          {editing && (
            <RecordDialog
              details={details}
              accountId={accountId}
              onClose={() => setEditing(false)}
              onSaved={async () => {
                await saved();
              }}
            />
          )}
          {action && (
            <RecordActionDialog
              record={record}
              action={action}
              onClose={() => setAction(null)}
              onSaved={async () => {
                if (action.status === 'archive') {
                  setAction(null);
                  await onChanged();
                  onBack();
                } else await saved();
              }}
            />
          )}
        </>
      )}
    </div>
  );
}
