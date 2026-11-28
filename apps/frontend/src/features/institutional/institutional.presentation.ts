import type {
  InstitutionalRecord,
  RecordKind,
  RecordType,
} from './institutional.types';
export const typeLabels: Readonly<Record<RecordType, string>> = {
  workshop: 'Taller',
  talk: 'Charla',
  campaign: 'Campaña',
  training: 'Capacitación',
  meeting: 'Reunión',
  research: 'Investigación',
  agreement: 'Convenio',
  program: 'Proyecto/programa',
  other: 'Otro',
};
export const statusLabels: Readonly<Record<string, string>> = {
  planned: 'Programada',
  active: 'Activo',
  completed: 'Finalizada',
  cancelled: 'Cancelada',
  draft: 'Borrador',
  expired: 'Vencido',
  closed: 'Cerrado',
};
export function kindForType(type: RecordType): RecordKind {
  return type === 'agreement'
    ? 'agreement'
    : type === 'program'
      ? 'project'
      : 'activity';
}
export function dateInput(value: string | null, kind: RecordKind): string {
  if (!value) return '';
  return kind === 'activity'
    ? new Date(Date.parse(value) - 4 * 3600000).toISOString().slice(0, 16)
    : value.slice(0, 10);
}
export function scheduleValue(value: string, kind: RecordKind): string | null {
  return !value
    ? null
    : kind === 'activity'
      ? new Date(`${value}:00-04:00`).toISOString()
      : value;
}
export function formatRecordDate(
  value: string | null,
  kind: RecordKind,
): string {
  if (!value) return 'Sin fecha';
  return new Intl.DateTimeFormat('es-BO', {
    timeZone: 'America/La_Paz',
    dateStyle: 'medium',
    ...(kind === 'activity' ? { timeStyle: 'short', hourCycle: 'h23' } : {}),
  }).format(new Date(kind === 'activity' ? value : `${value}T12:00:00Z`));
}
export function recordStatus(record: InstitutionalRecord): string {
  if (
    record.kind === 'agreement' &&
    record.status === 'active' &&
    record.endsAt
  ) {
    const today = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/La_Paz',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
    if (record.endsAt < today) return 'Vencido';
  }
  return record.kind === 'project' && record.status === 'completed'
    ? 'Finalizado'
    : (statusLabels[record.status] ?? record.status);
}
export function scheduledDuration(
  start: string | null,
  end: string | null,
): string | null {
  if (!start || !end) return null;
  const minutes = Math.round((Date.parse(end) - Date.parse(start)) / 60000);
  if (minutes <= 0) return null;
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}
export const terminal = (record: InstitutionalRecord) =>
  record.kind === 'agreement'
    ? record.status === 'closed'
    : ['completed', 'cancelled'].includes(record.status);
export const editable = (record: InstitutionalRecord) =>
  !terminal(record) ||
  (record.kind === 'activity' && record.status === 'completed');
