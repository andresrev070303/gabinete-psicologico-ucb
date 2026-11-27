import { useEffect, useRef, useState } from 'react';
import { listIdentityAudit } from './account-lifecycle.api';
import type { IdentityAuditPage } from './accounts.types';
export function IdentityAuditPanel() {
  const [opened, setOpened] = useState(false);
  return (
    <section className="identity-audit-panel">
      <h3>Identity audit</h3>
      <button type="button" onClick={() => setOpened(!opened)}>
        {opened ? 'Hide identity audit' : 'Show identity audit'}
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
          setError(
            failure instanceof Error
              ? failure.message
              : 'Could not load the audit.',
          );
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
      if (!controller.signal.aborted)
        setError(
          failure instanceof Error
            ? failure.message
            : 'Could not load the audit.',
        );
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
        Refresh identity audit
      </button>
      <div className="accounts-table">
        <table>
          <caption>Identity events within your authorized scope</caption>
          <thead>
            <tr>
              <th>When</th>
              <th>Action</th>
              <th>Account</th>
              <th>Actor / session / request</th>
              <th>Changed fields / reason</th>
            </tr>
          </thead>
          <tbody>
            {page?.items.map((entry) => (
              <tr key={entry.id}>
                <td>{new Date(entry.occurredAt).toLocaleString()}</td>
                <td>{entry.action}</td>
                <td>{entry.targetAccountId ?? 'System'}</td>
                <td>
                  {entry.actorAccountId ?? 'System'}
                  <br />
                  {entry.sessionId ?? 'No session'}
                  <br />
                  {entry.requestId}
                </td>
                <td>
                  {entry.changedFields.join(', ')}
                  {entry.reason && <p>{entry.reason}</p>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {page && (
        <nav aria-label="Audit pages">
          <button
            disabled={busy || page.page === 1}
            onClick={() => {
              void load(page.page - 1);
            }}
          >
            Previous audit page
          </button>
          <span>Page {page.page}</span>
          <button
            disabled={busy || page.page * page.pageSize >= page.total}
            onClick={() => {
              void load(page.page + 1);
            }}
          >
            Next audit page
          </button>
        </nav>
      )}
    </div>
  );
}
