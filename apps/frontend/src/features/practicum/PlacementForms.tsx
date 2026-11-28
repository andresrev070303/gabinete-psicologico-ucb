import type { FormEvent } from 'react';
import { updatePlacement } from './practicum.api';
import { placementStatusLabels } from './practicum.presentation';
import { usePracticumMutation } from './usePracticumResource';
import type { Placement, PlacementStatus } from './practicum.types';

export function PlacementForms({
  placement,
  onSaved,
  onCancel,
}: {
  placement: Placement;
  onSaved: () => Promise<void>;
  onCancel: () => void;
}) {
  const action = usePracticumMutation();
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    await action.run(
      (signal) =>
        updatePlacement(
          placement.id,
          {
            status: String(data.get('status')) as PlacementStatus,
            version: placement.version,
            reason: String(data.get('reason')),
          },
          signal,
        ),
      async () => {
        await onSaved();
        onCancel();
      },
    );
  }
  return (
    <section
      className="practice-form-panel surface-panel"
      aria-label="Cambiar estado de la práctica"
    >
      <h2>Estado de la práctica · {placement.studentName}</h2>
      {action.error && <p role="alert">{action.error}</p>}
      <form
        className="practice-form"
        aria-label="Estado de la práctica"
        onSubmit={(event) => {
          void submit(event);
        }}
      >
        <label>
          Estado
          <select
            name="status"
            defaultValue={placement.status}
            disabled={action.busy}
          >
            {Object.entries(placementStatusLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Motivo
          <textarea
            name="reason"
            minLength={5}
            maxLength={500}
            required
            disabled={action.busy}
          />
        </label>
        <div className="practice-actions">
          <button type="submit" disabled={action.busy}>
            Guardar estado
          </button>
          <button type="button" disabled={action.busy} onClick={onCancel}>
            Cancelar
          </button>
        </div>
      </form>
    </section>
  );
}
