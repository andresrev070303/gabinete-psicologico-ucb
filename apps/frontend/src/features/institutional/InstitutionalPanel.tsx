import { useCallback, useState } from 'react';
import type { FormEvent } from 'react';
import type { AuthenticatedIdentity } from '../auth/auth.types';
import { useAsyncResource } from '../../lib/useAsyncResource';
import { listRecords } from './institutional.api';
import { canManageInstitutional } from './institutional-access';
import {
  formatRecordDate,
  recordStatus,
  typeLabels,
} from './institutional.presentation';
import { RecordDialog } from './RecordDialog';
import { RecordDetailsPanel } from './RecordDetailsPanel';
import type { ListFilters, RecordKey } from './institutional.types';
import '../../styles/institutional.css';
const emptyFilters: ListFilters = {
  type: '',
  status: '',
  search: '',
  from: '',
  to: '',
};
export function InstitutionalPanel({
  identity,
  initialRecord,
}: {
  identity: AuthenticatedIdentity['identity'];
  initialRecord?: RecordKey | null;
}) {
  const [selected, setSelected] = useState<RecordKey | null>(
      initialRecord ?? null,
    ),
    [creating, setCreating] = useState(false);
  const [search, setSearch] = useState(''),
    [cursor, setCursor] = useState<string | null>(null),
    [previous, setPrevious] = useState<(string | null)[]>([]);
  const manage = canManageInstitutional(identity);
  const loader = useCallback(
    (signal: AbortSignal) =>
      listRecords({ ...emptyFilters, search }, cursor, signal),
    [search, cursor],
  );
  const resource = useAsyncResource(loader, !selected);
  function searchRecords(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setSearch(String(data.get('search') ?? '').trim());
    setCursor(null);
    setPrevious([]);
  }
  if (selected)
    return (
      <RecordDetailsPanel
        key={`${selected.kind}:${selected.id}`}
        recordKey={selected}
        canManage={manage}
        accountId={identity.accountId}
        onBack={() => setSelected(null)}
        onOpen={setSelected}
        onChanged={resource.refresh}
      />
    );
  return (
    <div className="institutional-panel">
      <div className="institutional-toolbar">
        <p>
          {manage
            ? 'Organiza las iniciativas del Gabinete y reúne a su equipo.'
            : 'Consulta los registros institucionales en los que participas.'}
        </p>
        <div>
          <button
            type="button"
            disabled={resource.busy}
            onClick={() => {
              void resource.refresh();
            }}
          >
            Actualizar
          </button>
          {manage && (
            <button
              className="primary-button"
              type="button"
              onClick={() => setCreating(true)}
            >
              + Crear
            </button>
          )}
        </div>
      </div>
      <section className="surface-panel institutional-list-panel">
        <form
          className="institutional-search"
          aria-label="Buscar registros institucionales"
          onSubmit={searchRecords}
        >
          <label>
            Buscar
            <input
              name="search"
              type="search"
              placeholder="Nombre o institución"
              maxLength={120}
              defaultValue={search}
            />
          </label>
          <button type="submit">Buscar</button>
        </form>
        {resource.busy && <p role="status">Cargando registros…</p>}
        {resource.error && (
          <p className="feedback" role="alert">
            {resource.error}
          </p>
        )}
        {resource.data && !resource.busy && (
          <>
            <div className="institutional-table-wrap">
              <table className="institutional-table">
                <caption>
                  {manage
                    ? 'Registros del Gabinete'
                    : 'Mis registros institucionales'}
                </caption>
                <thead>
                  <tr>
                    <th>Nombre</th>
                    <th>Tipo</th>
                    <th>Fecha o vigencia</th>
                    <th>Responsable</th>
                    <th>Estado</th>
                    <th>
                      <span className="sr-only">Consultar</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {resource.data.items.map((record) => (
                    <tr key={`${record.kind}:${record.id}`}>
                      <td>
                        <strong>{record.title}</strong>
                        {record.institutionName && (
                          <small>{record.institutionName}</small>
                        )}
                      </td>
                      <td>
                        <span className="institutional-type">
                          {typeLabels[record.type]}
                        </span>
                      </td>
                      <td>
                        {formatRecordDate(record.startsAt, record.kind)}
                        {record.endsAt && (
                          <small>
                            Hasta {formatRecordDate(record.endsAt, record.kind)}
                          </small>
                        )}
                      </td>
                      <td>{record.responsibleName || 'Sin responsable'}</td>
                      <td>{recordStatus(record)}</td>
                      <td>
                        <button
                          type="button"
                          aria-label={`Ver ${record.title}`}
                          onClick={() => setSelected(record)}
                        >
                          Ver
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!resource.data.items.length && (
              <div className="institutional-empty">
                <h2>
                  {search
                    ? 'No encontramos registros para esta búsqueda'
                    : manage
                      ? 'Todavía no hay registros'
                      : 'Todavía no tienes registros asignados'}
                </h2>
                <p>
                  {manage
                    ? 'Pulsa Crear para registrar una actividad, convenio o proyecto.'
                    : 'Cuando Dirección te incluya en un equipo, podrás consultarlo aquí.'}
                </p>
              </div>
            )}
            <div className="institutional-pagination">
              <button
                type="button"
                disabled={!previous.length}
                onClick={() => {
                  setCursor(previous.at(-1) ?? null);
                  setPrevious((items) => items.slice(0, -1));
                }}
              >
                Anterior
              </button>
              <button
                type="button"
                disabled={!resource.data.nextCursor}
                onClick={() => {
                  setPrevious((items) => [...items, cursor]);
                  setCursor(resource.data!.nextCursor);
                }}
              >
                Siguiente
              </button>
            </div>
          </>
        )}
      </section>
      {creating && (
        <RecordDialog
          accountId={identity.accountId}
          onClose={() => setCreating(false)}
          onSaved={async (details) => {
            setCreating(false);
            setSelected(details.record);
          }}
        />
      )}
    </div>
  );
}
