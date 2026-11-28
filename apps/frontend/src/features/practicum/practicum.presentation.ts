import type {
  ActivityKind,
  PlacementStatus,
  TaskStatus,
} from './practicum.types';
export const activityLabels: Readonly<Record<ActivityKind, string>> = {
  administration: 'Registros y administración',
  direct_care: 'Atención a personas',
  evaluation_support: 'Apoyo a evaluaciones',
  workshop: 'Taller o charla',
  research: 'Investigación',
  training: 'Formación y supervisión',
  other: 'Otra actividad',
};
export const placementStatusLabels: Readonly<Record<PlacementStatus, string>> =
  {
    active: 'Activa',
    completed: 'Finalizada',
  };
export const taskStatusLabels: Readonly<Record<TaskStatus, string>> = {
  active: 'Activa',
  completed: 'Finalizada',
  archived: 'Archivada',
};
export function activityLabel(kind: string): string {
  return Object.hasOwn(activityLabels, kind)
    ? activityLabels[kind as ActivityKind]
    : 'Otra actividad';
}
export function formatTotalTime(seconds: number): string {
  const minutes = Math.floor(Math.max(0, seconds) / 60);
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  return `${hours} ${hours === 1 ? 'hora' : 'horas'} y ${remaining} ${remaining === 1 ? 'minuto' : 'minutos'}`;
}
export function formatDuration(seconds: number): string {
  const total = Math.floor(Math.max(0, seconds));
  return [Math.floor(total / 3600), Math.floor(total / 60) % 60, total % 60]
    .map((value) => String(value).padStart(2, '0'))
    .join(':');
}
const dateFormatter = new Intl.DateTimeFormat('es-BO', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  timeZone: 'America/La_Paz',
});
const timeFormatter = new Intl.DateTimeFormat('es-BO', {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
  timeZone: 'America/La_Paz',
});
export function formatEntryDate(value: string): string {
  return dateFormatter.format(new Date(value));
}
export function formatEntryTime(value: string): string {
  return timeFormatter.format(new Date(value));
}
export function localDateTime(value: string): string {
  const shifted = new Date(Date.parse(value) - 4 * 3600000);
  return shifted.toISOString().slice(0, 19);
}
export function fromLocalDateTime(value: string): string {
  const result = new Date(`${value}-04:00`);
  if (!Number.isFinite(result.getTime()))
    throw new Error('Ingresa una fecha y hora válidas.');
  return result.toISOString();
}
