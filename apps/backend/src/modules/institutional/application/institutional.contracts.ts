import type { AuditContext } from '../../../infrastructure/database/audited-transaction.js';
import type {
  InstitutionalIdentity,
  RecordKind,
  RecordType,
} from '../domain/institutional.rules.js';
export type RecordKey = Readonly<{ kind: RecordKind; id: string }>;
export type InstitutionOption = Readonly<{
  id: string;
  name: string;
  kind: string;
}>;
export type TeamMember = Readonly<{
  accountId: string;
  name: string;
  roles: readonly string[];
}>;
export type RecordDraft = Readonly<{
  kind: RecordKind;
  type: RecordType;
  title: string;
  description: string | null;
  startsAt: string | null;
  endsAt: string | null;
  institutionId: string | null;
  responsibleAccountId: string;
  memberAccountIds: readonly string[];
  projectId: string | null;
  agreementId: string | null;
  code: string | null;
  venue: string | null;
}>;
export type NewRecord = RecordDraft & Readonly<{ id: string }>;
export type RecordChange = RecordDraft & Readonly<{ version: number }>;
export type StatusChange = Readonly<{
  version: number;
  status: string;
  reason: string;
  results: string | null;
  reportedParticipants: number | null;
}>;
export type RecordSummary = Readonly<{
  id: string;
  kind: RecordKind;
  type: RecordType;
  title: string;
  description: string | null;
  startsAt: string | null;
  endsAt: string | null;
  status: string;
  institutionId: string | null;
  institutionName: string | null;
  responsibleAccountId: string | null;
  responsibleName: string | null;
  projectId: string | null;
  projectName: string | null;
  agreementId: string | null;
  agreementName: string | null;
  code: string | null;
  venue: string | null;
  results: string | null;
  reportedParticipants: number | null;
  version: number;
  createdAt: string;
}>;
export type RecordDetails = Readonly<{
  record: RecordSummary;
  team: readonly TeamMember[];
  related: readonly RecordSummary[];
}>;
export type ListQuery = Readonly<{
  cursor: string | null;
  limit: number;
  type: RecordType | null;
  status: string | null;
  search: string;
  from: string | null;
  to: string | null;
}>;
export type RecordPage = Readonly<{
  items: readonly RecordSummary[];
  nextCursor: string | null;
}>;
export type InstitutionalCatalog = Readonly<{
  institutions: readonly InstitutionOption[];
  people: readonly TeamMember[];
  projects: readonly RecordSummary[];
  agreements: readonly RecordSummary[];
}>;
export interface InstitutionalUnitOfWork {
  readonly identity: InstitutionalIdentity & { accountId: string };
  readonly now: string;
  list(query: ListQuery): Promise<RecordPage>;
  details(key: RecordKey, lock?: boolean): Promise<RecordDetails>;
  catalog(): Promise<InstitutionalCatalog>;
  create(input: NewRecord): Promise<RecordDetails>;
  update(key: RecordKey, input: RecordChange): Promise<RecordDetails>;
  changeStatus(key: RecordKey, input: StatusChange): Promise<RecordDetails>;
  archive(key: RecordKey, version: number, reason: string): Promise<void>;
  validateReferences(input: RecordDraft): Promise<void>;
  synchronizeTeam(key: RecordKey, input: RecordDraft): Promise<void>;
  createInstitution(
    input: Readonly<{ id: string; name: string; kind: string }>,
  ): Promise<InstitutionOption>;
}
export interface InstitutionalStore {
  run<T>(
    actor: AuditContext,
    mutation: boolean,
    work: (unit: InstitutionalUnitOfWork) => Promise<T>,
  ): Promise<T>;
}
