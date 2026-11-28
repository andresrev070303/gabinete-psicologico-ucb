import { clockPattern, formatClockInput } from './institutional.schedule';
import type { ScheduleInput } from './institutional.schedule';

type ScheduleFieldsProps = Readonly<{
  label: 'Inicio' | 'Fin';
  value: ScheduleInput;
  required?: boolean;
  disabled: boolean;
  minDate?: string;
  onChange: (value: ScheduleInput) => void;
}>;

export function ScheduleFields({
  label,
  value,
  required = false,
  disabled,
  minDate,
  onChange,
}: ScheduleFieldsProps) {
  const suffix = label.toLocaleLowerCase('es');
  const needsSchedule = required || !!value.date || !!value.time;
  return (
    <fieldset className="institutional-schedule" disabled={disabled}>
      <legend>
        {label}
        {!required ? ' (opcional)' : ''}
      </legend>
      <div className="institutional-schedule-row">
        <label>
          Fecha
          <input
            type="date"
            aria-label={`Fecha de ${suffix}`}
            value={value.date}
            min={minDate || undefined}
            required={needsSchedule}
            onChange={(event) =>
              onChange({ ...value, date: event.target.value })
            }
          />
        </label>
        <label>
          Hora
          <input
            type="text"
            inputMode="numeric"
            aria-label={`Hora de ${suffix}`}
            value={value.time}
            placeholder="HH:mm"
            pattern={clockPattern}
            minLength={5}
            maxLength={5}
            title="Usa el formato de 24 horas, de 00:00 a 23:59; por ejemplo, 09:00 o 15:00"
            required={needsSchedule}
            onChange={(event) => {
              onChange({
                ...value,
                time: formatClockInput(event.target.value, value.time),
              });
            }}
          />
        </label>
      </div>
    </fieldset>
  );
}
