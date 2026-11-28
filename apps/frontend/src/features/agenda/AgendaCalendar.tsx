import { useId, useState } from 'react';
import { boliviaToday, monthDays } from './agenda.calendar';
import '../../styles/agenda.css';

const weekdays = [
  ['Lun', 'Lunes'],
  ['Mar', 'Martes'],
  ['Mié', 'Miércoles'],
  ['Jue', 'Jueves'],
  ['Vie', 'Viernes'],
  ['Sáb', 'Sábado'],
  ['Dom', 'Domingo'],
] as const;

export function AgendaCalendar() {
  const heading = useId();
  const today = boliviaToday();
  const [month, setMonth] = useState(
    () => new Date(`${today.slice(0, 7)}-01T00:00:00Z`),
  );
  const days = monthDays(month);
  const title = new Intl.DateTimeFormat('es-BO', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(month);
  function moveMonth(offset: number) {
    setMonth(
      (current) =>
        new Date(
          Date.UTC(current.getUTCFullYear(), current.getUTCMonth() + offset, 1),
        ),
    );
  }
  return (
    <section
      className="agenda-calendar surface-panel"
      aria-label="Calendario de mi agenda"
    >
      <header className="agenda-calendar-header">
        <h2 id={heading} aria-live="polite">
          {title}
        </h2>
        <div className="agenda-calendar-controls">
          <button
            type="button"
            aria-label="Mes anterior"
            onClick={() => moveMonth(-1)}
          >
            ‹
          </button>
          <button
            type="button"
            onClick={() =>
              setMonth(new Date(`${boliviaToday().slice(0, 7)}-01T00:00:00Z`))
            }
          >
            Hoy
          </button>
          <button
            type="button"
            aria-label="Mes siguiente"
            onClick={() => moveMonth(1)}
          >
            ›
          </button>
        </div>
      </header>
      <table className="agenda-calendar-grid" aria-labelledby={heading}>
        <thead>
          <tr>
            {weekdays.map(([short, full]) => (
              <th key={full} scope="col">
                <abbr title={full}>{short}</abbr>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: 6 }, (_, week) => (
            <tr key={week}>
              {days.slice(week * 7, week * 7 + 7).map((day) => (
                <td
                  key={day.date}
                  className={
                    day.inMonth ? undefined : 'agenda-calendar-outside'
                  }
                >
                  <time
                    dateTime={day.date}
                    aria-current={day.date === today ? 'date' : undefined}
                  >
                    {day.day}
                  </time>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
