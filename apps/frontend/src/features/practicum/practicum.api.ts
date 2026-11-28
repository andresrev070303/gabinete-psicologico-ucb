import { apiRequest } from '../../lib/api-client';
import type {
  EntryChange,
  EntryPage,
  NewPlacement,
  NewTask,
  Page,
  Placement,
  PlacementChange,
  PracticeTask,
  PracticumCatalog,
  Practitioner,
  TaskCreation,
  TimeEntry,
  TimerState,
} from './practicum.types';
type RecordValue = Record<string, unknown>;
function record(value: unknown): value is RecordValue {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
function strings(value: RecordValue, keys: readonly string[]): boolean {
  return keys.every((key) => typeof value[key] === 'string');
}
const nullableString = (value: unknown) =>
  value === null || typeof value === 'string';
const timestamp = (value: unknown) =>
  typeof value === 'string' && Number.isFinite(Date.parse(value));
const count = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0;
export function isPlacement(value: unknown): value is Placement {
  return (
    record(value) &&
    strings(value, [
      'id',
      'studentAccountId',
      'studentName',
      'studentEmail',
      'status',
    ]) &&
    ['active', 'completed'].includes(String(value.status)) &&
    count(value.version) &&
    count(value.totalSeconds) &&
    count(value.entryCount) &&
    typeof value.hasRunningTimer === 'boolean'
  );
}
export function isTask(value: unknown): value is PracticeTask {
  return (
    record(value) &&
    strings(value, [
      'id',
      'placementId',
      'title',
      'projectLabel',
      'activityKind',
      'status',
    ]) &&
    ['active', 'completed', 'archived'].includes(String(value.status)) &&
    count(value.version) &&
    nullableString(value.description) &&
    nullableString(value.createdByAccountId) &&
    typeof value.assignedByDirector === 'boolean'
  );
}
export function isEntry(value: unknown): value is TimeEntry {
  return (
    record(value) &&
    strings(value, [
      'id',
      'placementId',
      'taskTitle',
      'projectLabel',
      'activityKind',
      'source',
    ]) &&
    nullableString(value.taskId) &&
    nullableString(value.description) &&
    timestamp(value.startedAt) &&
    (value.endedAt === null || timestamp(value.endedAt)) &&
    (value.voidedAt === null || timestamp(value.voidedAt)) &&
    (value.durationSeconds === null || count(value.durationSeconds)) &&
    count(value.version) &&
    ['manual', 'timer'].includes(String(value.source))
  );
}
function isPage<T>(guard: (value: unknown) => value is T) {
  return (value: unknown): value is Page<T> =>
    record(value) &&
    Array.isArray(value.items) &&
    value.items.every(guard) &&
    nullableString(value.nextCursor);
}
function isTimer(value: unknown): value is TimerState {
  return (
    record(value) &&
    (value.entry === null || isEntry(value.entry)) &&
    timestamp(value.serverNow)
  );
}
function isCatalog(value: unknown): value is PracticumCatalog {
  if (!record(value)) return false;
  const options = (items: unknown) =>
    Array.isArray(items) &&
    items.every(
      (item) => record(item) && strings(item, ['id', 'name', 'email']),
    );
  return options(value.students);
}
function isEntryPage(value: unknown): value is EntryPage {
  return (
    record(value) &&
    count(value.totalSeconds) &&
    count(value.entryCount) &&
    timestamp(value.serverNow) &&
    isPage(isEntry)(value)
  );
}
const messages: Readonly<Record<string, string>> = {
  forbidden: 'Tu perfil no permite realizar esta operación.',
  not_found: 'La práctica o el registro no está disponible para tu cuenta.',
  invalid_input: 'Revisa los datos del formulario e intenta nuevamente.',
  inactive_placement: 'La práctica debe estar activa para registrar tiempo.',
  invalid_period:
    'Revisa las fechas: el intervalo debe ser válido, no incluir tiempo futuro.',
  inactive_task: 'La tarea no está activa. Reábrela o selecciona otra tarea.',
  timer_running:
    'Ya hay un cronómetro en curso. Detén o anula ese registro antes de continuar.',
  overlap:
    'Este intervalo se superpone con otro registro de horas. Revisa el inicio y el fin.',
  version_conflict:
    'El registro cambió mientras lo editabas. Actualiza la vista antes de intentarlo nuevamente.',
  duplicate:
    'Ya existe ese registro o la persona ya tiene una práctica registrada.',
  unavailable:
    'La gestión de prácticas no está disponible temporalmente. Intenta nuevamente.',
};
async function request<T>(
  path: string,
  signal: AbortSignal,
  guard: (value: unknown) => value is T,
  method = 'GET',
  input?: unknown,
): Promise<T> {
  const response = await apiRequest(
    `practicum/${path}`,
    { method, body: input === undefined ? undefined : JSON.stringify(input) },
    signal,
  );
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status === 401)
      throw new Error('Tu sesión venció. Ingresa nuevamente para continuar.');
    const code = record(body) && typeof body.code === 'string' ? body.code : '';
    throw new Error(
      Object.hasOwn(messages, code)
        ? messages[code]
        : response.status === 403
          ? messages.forbidden
          : 'No pudimos completar la operación de prácticas.',
    );
  }
  if (!guard(body))
    throw new Error('El servicio devolvió datos de prácticas inesperados.');
  return body;
}
function pagePath(resource: string, cursor: string | null): string {
  const query = new URLSearchParams({ limit: '20' });
  if (cursor) query.set('cursor', cursor);
  return `${resource}?${query}`;
}
const id = encodeURIComponent;
function isPractitioner(value: unknown): value is Practitioner {
  return (
    record(value) &&
    strings(value, [
      'studentAccountId',
      'studentName',
      'studentEmail',
      'status',
    ]) &&
    nullableString(value.placementId) &&
    ['active', 'completed'].includes(String(value.status)) &&
    count(value.totalSeconds) &&
    count(value.entryCount) &&
    typeof value.hasRunningTimer === 'boolean'
  );
}
export const initializeOwnPlacement = (signal: AbortSignal) =>
  request('my-placement', signal, isPlacement, 'POST', {});
export const listPractitioners = (cursor: string | null, signal: AbortSignal) =>
  request(pagePath('practitioners', cursor), signal, isPage(isPractitioner));
export const listPlacements = (cursor: string | null, signal: AbortSignal) =>
  request(pagePath('placements', cursor), signal, isPage(isPlacement));
export const listOwnPlacements = (cursor: string | null, signal: AbortSignal) =>
  request(pagePath('my-placements', cursor), signal, isPage(isPlacement));
export const getPlacement = (placementId: string, signal: AbortSignal) =>
  request(`placements/${id(placementId)}`, signal, isPlacement);
export const getCatalog = (signal: AbortSignal) =>
  request('catalog', signal, isCatalog);
export const createPlacement = (input: NewPlacement, signal: AbortSignal) =>
  request('placements', signal, isPlacement, 'POST', input);
export const updatePlacement = (
  placementId: string,
  input: PlacementChange,
  signal: AbortSignal,
) =>
  request(`placements/${id(placementId)}`, signal, isPlacement, 'PATCH', input);
export const listTasks = (
  placementId: string,
  cursor: string | null,
  signal: AbortSignal,
) =>
  request(
    pagePath(`placements/${id(placementId)}/tasks`, cursor),
    signal,
    isPage(isTask),
  );
export const createTask = (
  placementId: string,
  input: NewTask,
  signal: AbortSignal,
) =>
  request(
    `placements/${id(placementId)}/tasks`,
    signal,
    (value: unknown): value is TaskCreation =>
      record(value) &&
      isTask(value.task) &&
      (value.timer === null || isEntry(value.timer)) &&
      timestamp(value.serverNow),
    'POST',
    input,
  );
export const listEntries = (
  placementId: string,
  cursor: string | null,
  signal: AbortSignal,
) =>
  request(
    pagePath(`placements/${id(placementId)}/entries`, cursor),
    signal,
    isEntryPage,
  );
export const startTimer = (
  placementId: string,
  input: { id: string; taskId: string; description: string | null },
  signal: AbortSignal,
) =>
  request(
    `placements/${id(placementId)}/timer`,
    signal,
    isTimer,
    'POST',
    input,
  );
export const getRunningTimer = (signal: AbortSignal) =>
  request('running-timer', signal, isTimer);
export const stopTimer = (
  entryId: string,
  signal: AbortSignal,
  stoppedAt?: string,
) =>
  request(
    `entries/${id(entryId)}/stop`,
    signal,
    isEntry,
    'POST',
    stoppedAt ? { stoppedAt } : {},
  );
export const editEntry = (
  entryId: string,
  input: EntryChange,
  signal: AbortSignal,
) => request(`entries/${id(entryId)}`, signal, isEntry, 'PATCH', input);
export const resumeEntry = (
  entryId: string,
  idValue: string,
  signal: AbortSignal,
) =>
  request(`entries/${id(entryId)}/resume`, signal, isTimer, 'POST', {
    id: idValue,
  });
export const voidEntry = (
  entryId: string,
  version: number,
  reason: string,
  signal: AbortSignal,
) =>
  request(`entries/${id(entryId)}/void`, signal, isEntry, 'POST', {
    version,
    reason,
  });
