import { useEffect, useId, useRef } from 'react';
import { voidEntry } from './practicum.api';
import { usePracticumMutation } from './usePracticumResource';
import type { TimeEntry } from './practicum.types';

export function DeleteTimeEntryDialog({
  entry,
  onSaved,
  onClose,
}: {
  entry: TimeEntry;
  onSaved: () => Promise<void>;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const headingId = useId();
  const action = usePracticumMutation();
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => {
      if (element?.open) element.close();
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      className="practice-dialog"
      aria-labelledby={headingId}
      onCancel={(event) => {
        event.preventDefault();
        if (!action.busy) onClose();
      }}
    >
      <header className="practice-dialog-header">
        <h2 id={headingId}>Eliminar registro</h2>
        <button
          type="button"
          aria-label="Cerrar eliminación"
          disabled={action.busy}
          onClick={onClose}
        >
          ×
        </button>
      </header>
      <form
        className="practice-dialog-form"
        onSubmit={(event) => {
          event.preventDefault();
          void action.run(
            (signal) =>
              voidEntry(
                entry.id,
                entry.version,
                'Time entry deleted by user',
                signal,
              ),
            onSaved,
          );
        }}
      >
        <p>
          ¿Eliminar el registro de <strong>{entry.taskTitle}</strong>? Su tiempo
          dejará de sumarse al total de horas.
        </p>
        {action.error && <p role="alert">{action.error}</p>}
        <footer className="practice-dialog-footer">
          <button type="button" onClick={onClose} disabled={action.busy}>
            Cancelar
          </button>
          <button
            type="submit"
            className="primary-button"
            disabled={action.busy}
          >
            {action.busy ? 'Eliminando…' : 'Eliminar'}
          </button>
        </footer>
      </form>
    </dialog>
  );
}
