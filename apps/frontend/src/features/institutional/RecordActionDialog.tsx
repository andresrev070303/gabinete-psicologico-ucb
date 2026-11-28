import { useEffect, useId, useRef } from 'react';
import type { FormEvent } from 'react';
import { useAsyncMutation } from '../../lib/useAsyncResource';
import { archiveRecord, changeRecordStatus } from './institutional.api';
import type { InstitutionalRecord } from './institutional.types';
export type RecordAction = Readonly<{ status: string; label: string }>;
export function RecordActionDialog({
  record,
  action,
  onSaved,
  onClose,
}: {
  record: InstitutionalRecord;
  action: RecordAction;
  onSaved: () => Promise<void>;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    heading = useId(),
    mutation = useAsyncMutation();
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => {
      if (element?.open) element.close();
    };
  }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (mutation.busy) return;
    const reason = action.label;
    await mutation.run(
      (signal) =>
        action.status === 'archive'
          ? archiveRecord(record, { version: record.version, reason }, signal)
          : changeRecordStatus(
              record,
              {
                version: record.version,
                reason,
                status: action.status,
                results: null,
                reportedParticipants: null,
              },
              signal,
            ),
      onSaved,
    );
  }
  return (
    <dialog
      ref={dialog}
      className="institutional-dialog institutional-dialog--small"
      aria-labelledby={heading}
      onCancel={(event) => {
        event.preventDefault();
        if (!mutation.busy) onClose();
      }}
    >
      <header>
        <h2 id={heading}>{action.label}</h2>
        <button
          type="button"
          aria-label="Cerrar confirmación"
          disabled={mutation.busy}
          onClick={onClose}
        >
          ×
        </button>
      </header>
      <form
        aria-label="Confirmar acción institucional"
        onSubmit={(event) => {
          void submit(event);
        }}
      >
        <p>{record.title}</p>
        {mutation.error && <p role="alert">{mutation.error}</p>}
        <p className="institutional-help">
          {action.status === 'archive'
            ? 'El registro se retirará de la lista. Se conservarán sus datos, su estado anterior y su historial.'
            : 'Confirma el cambio de estado de este registro.'}
        </p>
        <footer>
          <button type="button" disabled={mutation.busy} onClick={onClose}>
            Volver
          </button>
          <button
            className="primary-button"
            type="submit"
            disabled={mutation.busy}
          >
            {mutation.busy ? 'Guardando…' : 'Confirmar'}
          </button>
        </footer>
      </form>
    </dialog>
  );
}
