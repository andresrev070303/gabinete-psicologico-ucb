import { isRecord, isNullableText, requestJson } from '../../lib/api-response';
import { typeLabels } from './institutional.presentation';
import type {
  InstitutionalCatalog,
  InstitutionalRecord,
  RecordDetails,
  RecordDraft,
  RecordKey,
  RecordPage,
  TeamMember,
  InstitutionOption,
  ListFilters,
} from './institutional.types';
export function isInstitutionalRecord(
  value: unknown,
): value is InstitutionalRecord {
  return (
    isRecord(value) &&
    ['id', 'kind', 'type', 'title', 'status', 'createdAt'].every(
      (key) => typeof value[key] === 'string',
    ) &&
    ['activity', 'agreement', 'project'].includes(String(value.kind)) &&
    Object.hasOwn(typeLabels, String(value.type)) &&
    [
      'description',
      'startsAt',
      'endsAt',
      'institutionId',
      'institutionName',
      'responsibleAccountId',
      'responsibleName',
      'projectId',
      'projectName',
      'agreementId',
      'agreementName',
      'code',
      'venue',
      'results',
    ].every((key) => isNullableText(value[key])) &&
    typeof value.version === 'number' &&
    Number.isSafeInteger(value.version) &&
    value.version > 0 &&
    (value.reportedParticipants === null ||
      (typeof value.reportedParticipants === 'number' &&
        Number.isSafeInteger(value.reportedParticipants) &&
        value.reportedParticipants >= 0))
  );
}
const isTeam = (value: unknown): value is TeamMember =>
  isRecord(value) &&
  typeof value.accountId === 'string' &&
  typeof value.name === 'string' &&
  Array.isArray(value.roles) &&
  value.roles.every((role) => typeof role === 'string');
const isInstitution = (value: unknown): value is InstitutionOption =>
  isRecord(value) &&
  ['id', 'name', 'kind'].every((key) => typeof value[key] === 'string');
export const isDetails = (value: unknown): value is RecordDetails =>
  isRecord(value) &&
  isInstitutionalRecord(value.record) &&
  Array.isArray(value.team) &&
  value.team.every(isTeam) &&
  Array.isArray(value.related) &&
  value.related.every(isInstitutionalRecord);
const isPage = (value: unknown): value is RecordPage =>
  isRecord(value) &&
  Array.isArray(value.items) &&
  value.items.every(isInstitutionalRecord) &&
  isNullableText(value.nextCursor);
const isCatalog = (value: unknown): value is InstitutionalCatalog =>
  isRecord(value) &&
  Array.isArray(value.institutions) &&
  value.institutions.every(isInstitution) &&
  Array.isArray(value.people) &&
  value.people.every(isTeam) &&
  Array.isArray(value.projects) &&
  value.projects.every(isInstitutionalRecord) &&
  Array.isArray(value.agreements) &&
  value.agreements.every(isInstitutionalRecord);
const messages = {
  invalid_input: 'Revisa los datos del formulario.',
  invalid_period: 'Revisa el inicio y el fin del registro.',
  invalid_transition:
    'Ese cambio no está disponible. Una actividad puede marcarse como realizada después de su inicio; los registros finalizados conservan su estado.',
  invalid_reference:
    'Una persona o un vínculo ya no está disponible. Actualiza las opciones; el responsable debe ser Director o Psicólogo y la institución debe coincidir con el convenio.',
  version_conflict:
    'Otra operación modificó este registro. Actualiza la vista antes de editar.',
  duplicate: 'El identificador o código ya está registrado. Revisa los datos.',
  linked_records:
    'Este registro tiene actividades vinculadas. Conserva sus vínculos antes de eliminarlo o cambiar su institución.',
  unavailable:
    'La gestión institucional no está disponible temporalmente. Intenta nuevamente.',
};
const path = (key: RecordKey) =>
  `institutional/records/${key.kind}/${encodeURIComponent(key.id)}`;
export function listRecords(
  filters: ListFilters,
  cursor: string | null,
  signal: AbortSignal,
) {
  const query = new URLSearchParams({ limit: '20' });
  for (const [key, value] of Object.entries(filters))
    if (value) query.set(key, value);
  if (cursor) query.set('cursor', cursor);
  return requestJson(`institutional/records?${query}`, signal, isPage, {
    messages,
  });
}
export const getRecord = (key: RecordKey, signal: AbortSignal) =>
  requestJson(path(key), signal, isDetails, { messages });
export const getInstitutionalCatalog = (signal: AbortSignal) =>
  requestJson('institutional/catalog', signal, isCatalog, { messages });
export const createRecord = (
  input: RecordDraft & { id: string },
  signal: AbortSignal,
) =>
  requestJson('institutional/records', signal, isDetails, {
    method: 'POST',
    input,
    messages,
  });
export const updateRecord = (
  key: RecordKey,
  input: RecordDraft & { version: number },
  signal: AbortSignal,
) =>
  requestJson(path(key), signal, isDetails, {
    method: 'PATCH',
    input,
    messages,
  });
export const changeRecordStatus = (
  key: RecordKey,
  input: {
    version: number;
    status: string;
    reason: string;
    results: string | null;
    reportedParticipants: number | null;
  },
  signal: AbortSignal,
) =>
  requestJson(`${path(key)}/status`, signal, isDetails, {
    method: 'POST',
    input,
    messages,
  });
export const archiveRecord = (
  key: RecordKey,
  input: { version: number; reason: string },
  signal: AbortSignal,
) =>
  requestJson(
    `${path(key)}/archive`,
    signal,
    (value): value is null => value === null,
    { method: 'POST', input, messages },
  );
export const createInstitution = (
  input: { id: string; name: string; kind: string },
  signal: AbortSignal,
) =>
  requestJson('institutional/institutions', signal, isInstitution, {
    method: 'POST',
    input,
    messages,
  });
