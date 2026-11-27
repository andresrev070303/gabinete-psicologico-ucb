import { useEffect, useRef, useState } from 'react';
import { listIdentityAudit } from './account-lifecycle.api';
import type { IdentityAuditPage } from './accounts.types';
import {
  formatDateTime,
  getAuditActionLabel,
  getAuditFieldLabel,
  getUserError,
} from '../../lib/presentation';
export function IdentityAuditPanel() {
  const [opened, setOpened] = useState(false);
  return (
    <section className="identity-audit-panel">
      <h3>Auditoría de accesos</h3>
      <button type="button" onClick={() => setOpened(!opened)}>
        {opened ? 'Ocultar auditoría' : 'Mostrar auditoría'}
      </button>
      {opened && <AuditDetails />}
    </section>
  );
}
function AuditDetails() {
  const [page, setPage] = useState<IdentityAuditPage | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const active = useRef<AbortController | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    active.current = controller;
    void listIdentityAudit(1, controller.signal).then(
      (result) => {
        if (!controller.signal.aborted) {
          setPage(result);
          setBusy(false);
        }
      },
      (failure: unknown) => {
        if (!controller.signal.aborted) {
          setError(getUserError(failure));
          setBusy(false);
        }
      },
    );
    return () => active.current?.abort();
  }, []);
  async function load(number: number) {
    active.current?.abort();
    const controller = new AbortController();
    active.current = controller;
    setBusy(true);
    setError(null);
    try {
      const result = await listIdentityAudit(number, controller.signal);
      if (!controller.signal.aborted) setPage(result);
    } catch (failure) {
      if (!controller.signal.aborted) setError(getUserError(failure));
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  return (
    <div aria-busy={busy}>
      {error && <p role="alert">{error}</p>}
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          void load(page?.page ?? 1);
        }}
      >
        Actualizar auditoría
      </button>
      <div className="accounts-table">
        <table>
          <caption>Operaciones dentro de tu ámbito autorizado</caption>
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Acción</th>
              <th>Cuenta</th>
              <th>Responsable / sesión / solicitud</th>
              <th>Campos modificados / motivo</th>
            </tr>
          </thead>
          <tbody>
            {page?.items.map((entry) => (
              <tr key={entry.id}>
                <td>{formatDateTime(entry.occurredAt)}</td>
                <td>{getAuditActionLabel(entry.action)}</td>
                <td>{entry.targetAccountId ?? 'Sistema'}</td>
                <td>
                  {entry.actorAccountId ?? 'Sistema'}
                  <br />
                  {entry.sessionId ?? 'Sin sesión'}
                  <br />
                  {entry.requestId}
                </td>
                <td>
                  {entry.changedFields.map(getAuditFieldLabel).join(', ')}
                  {entry.reason && <p>{entry.reason}</p>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {page?.total === 0 && (
        <p>No hay operaciones registradas en tu ámbito autorizado.</p>
      )}
      {page && (
        <nav aria-label="Páginas de auditoría">
          <button
            disabled={busy || page.page === 1}
            onClick={() => {
              void load(page.page - 1);
            }}
          >
            Página anterior de auditoría
          </button>
          <span>Página {page.page}</span>
          <button
            disabled={busy || page.page * page.pageSize >= page.total}
            onClick={() => {
              void load(page.page + 1);
            }}
          >
            Página siguiente de auditoría
          </button>
        </nav>
      )}
    </div>
  );
}
