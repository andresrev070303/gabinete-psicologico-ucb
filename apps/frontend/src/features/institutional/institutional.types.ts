export type RecordKind = 'activity' | 'agreement' | 'project';
export type RecordType =
  | 'workshop'
  | 'talk'
  | 'campaign'
  | 'training'
  | 'meeting'
  | 'research'
  | 'other'
  | 'agreement'
  | 'program';
export type RecordKey = Readonly<{ kind: RecordKind; id: string }>;
export type TeamMember = Readonly<{
  accountId: string;
  name: string;
  roles: readonly string[];
}>;
export type InstitutionOption = Readonly<{
  id: string;
  name: string;
  kind: string;
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
export type InstitutionalRecord = Omit<
  RecordDraft,
  'memberAccountIds' | 'responsibleAccountId'
> &
  Readonly<{
    id: string;
    status: string;
    institutionName: string | null;
    responsibleAccountId: string | null;
    responsibleName: string | null;
    projectName: string | null;
    agreementName: string | null;
    results: string | null;
    reportedParticipants: number | null;
    version: number;
    createdAt: string;
  }>;
export type RecordDetails = Readonly<{
  record: InstitutionalRecord;
  team: readonly TeamMember[];
  related: readonly InstitutionalRecord[];
}>;
export type RecordPage = Readonly<{
  items: readonly InstitutionalRecord[];
  nextCursor: string | null;
}>;
export type InstitutionalCatalog = Readonly<{
  institutions: readonly InstitutionOption[];
  people: readonly TeamMember[];
  projects: readonly InstitutionalRecord[];
  agreements: readonly InstitutionalRecord[];
}>;
export type ListFilters = Readonly<{
  type: string;
  status: string;
  search: string;
  from: string;
  to: string;
}>;
