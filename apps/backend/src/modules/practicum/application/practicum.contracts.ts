import type { AuditContext } from '../../../infrastructure/database/audited-transaction.js';
import type {
  AccessIdentity,
  ActivityKind,
  PlacementStatus,
  PracticumOperation,
  TaskStatus,
} from '../domain/practicum.rules.js';

export type PracticumActor = AuditContext;
export type Page<T> = Readonly<{
  items: readonly T[];
  nextCursor: string | null;
}>;
export type PageQuery = Readonly<{ cursor: string | null; limit: number }>;
export type AccountOption = Readonly<{
  id: string;
  name: string;
  email: string;
}>;
export type PracticumCatalog = Readonly<{
  students: readonly AccountOption[];
}>;
export type Placement = Readonly<{
  id: string;
  studentAccountId: string;
  studentName: string;
  studentEmail: string;
  status: PlacementStatus;
  version: number;
  totalSeconds: number;
  entryCount: number;
  hasRunningTimer: boolean;
}>;
export type Practitioner = Omit<Placement, 'id' | 'version'> &
  Readonly<{ placementId: string | null }>;
export type NewPlacement = Readonly<{
  studentAccountId: string;
}>;
export type PlacementChange = Readonly<{
  status: PlacementStatus;
  version: number;
  reason: string;
}>;
export type PracticeTask = Readonly<{
  id: string;
  placementId: string;
  title: string;
  projectLabel: string;
  activityKind: ActivityKind;
  description: string | null;
  status: TaskStatus;
  version: number;
  assignedByDirector: boolean;
  createdByAccountId: string | null;
}>;
export type NewTask = Readonly<{
  id: string;
  title: string;
  projectLabel: string;
  activityKind: ActivityKind;
  description: string | null;
  startTimer: boolean;
  entryId: string | null;
}>;
export type TaskChange = Readonly<{
  status: TaskStatus;
  version: number;
  reason: string | null;
}>;
export type TimeEntry = Readonly<{
  id: string;
  placementId: string;
  taskId: string | null;
  taskTitle: string;
  projectLabel: string;
  activityKind: string;
  description: string | null;
  startedAt: string;
  endedAt: string | null;
  durationSeconds: number | null;
  source: 'manual' | 'timer';
  version: number;
  voidedAt: string | null;
}>;
export type EntryPage = Page<TimeEntry> &
  Readonly<{ totalSeconds: number; entryCount: number; serverNow: string }>;
export type StopTimer = Readonly<{ stoppedAt: string | null }>;
export type StartTimer = Readonly<{
  id: string;
  taskId: string;
  description: string | null;
}>;
export type EntryChange = Readonly<{
  projectLabel: string;
  title: string;
  description: string | null;
  version: number;
}>;
export type ResumeEntry = Readonly<{ id: string }>;
export type EntryRevision = Readonly<{
  id: string;
  action: string;
  changedAt: string;
  reason: string;
  previousStartedAt: string;
  previousEndedAt: string | null;
  previousDescription: string | null;
  actorAccountId: string | null;
  sessionId: string | null;
  requestId: string;
}>;
export type TimerState = Readonly<{
  entry: TimeEntry | null;
  serverNow: string;
}>;
export type TaskCreation = Readonly<{
  task: PracticeTask;
  timer: TimeEntry | null;
  serverNow: string;
}>;

/** Repository boundary keeps database and HTTP dependencies outside application rules. */
export interface PracticumUnitOfWork {
  readonly identity: AccessIdentity;
  readonly now: string;
  catalog(): Promise<PracticumCatalog>;
  assertEligibleStudent(id: string): Promise<void>;
  ensurePlacement(studentAccountId: string): Promise<Placement>;
  directory(query: PageQuery): Promise<Page<Practitioner>>;
  listPlacements(query: PageQuery, onlyOwn?: boolean): Promise<Page<Placement>>;
  placement(id: string, lock?: boolean): Promise<Placement>;
  updatePlacement(id: string, input: PlacementChange): Promise<Placement>;
  tasks(placementId: string, query: PageQuery): Promise<Page<PracticeTask>>;
  task(id: string, placementId: string, lock?: boolean): Promise<PracticeTask>;
  createTask(placementId: string, input: NewTask): Promise<PracticeTask>;
  updateTask(id: string, input: TaskChange): Promise<PracticeTask>;
  entry(id: string, lock?: boolean): Promise<TimeEntry>;
  entries(placementId: string, query: PageQuery): Promise<EntryPage>;
  runningTimer(): Promise<TimerState>;
  insertEntry(
    placement: Placement,
    task: PracticeTask,
    input: Readonly<{
      id: string;
      startedAt: string;
      endedAt: string | null;
      description: string | null;
      source: 'manual' | 'timer';
    }>,
  ): Promise<TimeEntry>;
  stopEntry(id: string, endedAt: string): Promise<TimeEntry>;
  resolveEntryTask(
    placementId: string,
    details: Pick<EntryChange, 'title' | 'projectLabel' | 'description'>,
  ): Promise<PracticeTask>;
  editEntry(
    id: string,
    task: PracticeTask,
    input: EntryChange,
  ): Promise<TimeEntry>;
  voidEntry(id: string, version: number, reason: string): Promise<TimeEntry>;
  revisions(id: string): Promise<readonly EntryRevision[]>;
}
export interface PracticumStore {
  run<T>(
    actor: PracticumActor,
    operation: PracticumOperation,
    work: (unit: PracticumUnitOfWork) => Promise<T>,
  ): Promise<T>;
}
