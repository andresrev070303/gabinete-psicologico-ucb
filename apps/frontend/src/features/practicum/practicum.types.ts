export type ActivityKind =
  | 'administration'
  | 'direct_care'
  | 'evaluation_support'
  | 'workshop'
  | 'research'
  | 'training'
  | 'other';
export type PlacementStatus = 'active' | 'completed';
export type TaskStatus = 'active' | 'completed' | 'archived';
export type Page<T> = Readonly<{
  items: readonly T[];
  nextCursor: string | null;
}>;
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
export type EntryChange = Readonly<{
  title: string;
  projectLabel: string;
  description: string | null;
  version: number;
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
