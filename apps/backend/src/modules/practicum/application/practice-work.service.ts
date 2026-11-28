import type {
  EntryChange,
  NewTask,
  PageQuery,
  Placement,
  PracticumActor,
  PracticumStore,
  PracticumUnitOfWork,
  StartTimer,
  ResumeEntry,
  StopTimer,
  TaskChange,
} from './practicum.contracts.js';
import {
  canManagePracticum,
  canTrackPracticum,
  PracticumError,
  TimeInterval,
  resolveStopTime,
} from '../domain/practicum.rules.js';

function assertTracking(unit: PracticumUnitOfWork, placement: Placement): void {
  if (
    !canTrackPracticum(unit.identity) ||
    placement.studentAccountId !== unit.identity.accountId
  )
    throw new PracticumError('forbidden');
  if (placement.status !== 'active')
    throw new PracticumError('inactive_placement');
}
function assertEditable(unit: PracticumUnitOfWork, placement: Placement): void {
  if (!canManagePracticum(unit.identity)) assertTracking(unit, placement);
}
async function lockEntry(unit: PracticumUnitOfWork, id: string) {
  const reference = await unit.entry(id);
  const placement = await unit.placement(reference.placementId, true);
  const entry = await unit.entry(id, true);
  return { placement, entry };
}

export class PracticeWorkService {
  constructor(private readonly store: PracticumStore) {}
  tasks(actor: PracticumActor, placementId: string, query: PageQuery) {
    return this.store.run(actor, 'read', async (unit) => {
      await unit.placement(placementId);
      return unit.tasks(placementId, query);
    });
  }
  createTask(actor: PracticumActor, placementId: string, input: NewTask) {
    return this.store.run(actor, 'edit', async (unit) => {
      const placement = await unit.placement(placementId, true);
      assertEditable(unit, placement);
      if (placement.status !== 'active')
        throw new PracticumError('inactive_placement');
      if (input.startTimer) assertTracking(unit, placement);
      const task = await unit.createTask(placementId, input);
      let timer = null;
      if (input.startTimer) {
        if (!input.entryId) throw new PracticumError('invalid_input');
        const interval = new TimeInterval(unit.now, null);
        interval.assertNotFuture(unit.now);
        timer = await unit.insertEntry(placement, task, {
          id: input.entryId,
          startedAt: interval.startedAt,
          endedAt: null,
          description: input.description,
          source: 'timer',
        });
      }
      return { task, timer, serverNow: unit.now };
    });
  }
  updateTask(
    actor: PracticumActor,
    placementId: string,
    id: string,
    input: TaskChange,
  ) {
    return this.store.run(actor, 'manage', async (unit) => {
      await unit.placement(placementId, true);
      if (!canManagePracticum(unit.identity))
        throw new PracticumError('forbidden');
      const task = await unit.task(id, placementId, true);
      if (task.version !== input.version)
        throw new PracticumError('version_conflict');
      return unit.updateTask(id, input);
    });
  }
  entries(actor: PracticumActor, placementId: string, query: PageQuery) {
    return this.store.run(actor, 'read', async (unit) => {
      await unit.placement(placementId);
      return unit.entries(placementId, query);
    });
  }
  runningTimer(actor: PracticumActor) {
    return this.store.run(actor, 'track', (unit) => unit.runningTimer());
  }
  start(actor: PracticumActor, placementId: string, input: StartTimer) {
    return this.store.run(actor, 'track', async (unit) => {
      const placement = await unit.placement(placementId, true);
      assertTracking(unit, placement);
      const task = await unit.task(input.taskId, placementId, true);
      if (task.status !== 'active') throw new PracticumError('inactive_task');
      const interval = new TimeInterval(unit.now, null);
      interval.assertNotFuture(unit.now);
      const entry = await unit.insertEntry(placement, task, {
        ...input,
        startedAt: interval.startedAt,
        endedAt: null,
        source: 'timer',
      });
      return { entry, serverNow: unit.now };
    });
  }
  stop(
    actor: PracticumActor,
    id: string,
    input: StopTimer = { stoppedAt: null },
  ) {
    return this.store.run(actor, 'track', async (unit) => {
      const { placement, entry } = await lockEntry(unit, id);
      if (placement.studentAccountId !== unit.identity.accountId)
        throw new PracticumError('forbidden');
      if (entry.voidedAt || entry.source !== 'timer')
        throw new PracticumError('invalid_input');
      if (entry.endedAt !== null) return entry;
      const interval = new TimeInterval(
        entry.startedAt,
        resolveStopTime(entry.startedAt, unit.now, input.stoppedAt),
      );
      interval.assertNotFuture(unit.now);
      return unit.stopEntry(id, interval.endedAt!);
    });
  }
  edit(actor: PracticumActor, id: string, input: EntryChange) {
    return this.store.run(actor, 'track', async (unit) => {
      const { placement, entry } = await lockEntry(unit, id);
      assertTracking(unit, placement);
      if (entry.version !== input.version)
        throw new PracticumError('version_conflict');
      if (entry.voidedAt) throw new PracticumError('invalid_input');
      const task = await unit.resolveEntryTask(placement.id, input);
      return unit.editEntry(id, task, input);
    });
  }
  resume(actor: PracticumActor, id: string, input: ResumeEntry) {
    return this.store.run(actor, 'track', async (unit) => {
      const { placement, entry } = await lockEntry(unit, id);
      assertTracking(unit, placement);
      if (entry.voidedAt || entry.endedAt === null)
        throw new PracticumError('invalid_input');
      const task = await unit.resolveEntryTask(placement.id, {
        title: entry.taskTitle,
        projectLabel: entry.projectLabel,
        description: entry.description,
      });
      const resumed = await unit.insertEntry(placement, task, {
        id: input.id,
        startedAt: unit.now,
        endedAt: null,
        description: entry.description,
        source: 'timer',
      });
      return { entry: resumed, serverNow: unit.now };
    });
  }
  void(actor: PracticumActor, id: string, version: number, reason: string) {
    return this.store.run(actor, 'track', async (unit) => {
      const { placement, entry } = await lockEntry(unit, id);
      assertTracking(unit, placement);
      if (entry.version !== version)
        throw new PracticumError('version_conflict');
      if (entry.voidedAt) return entry;
      return unit.voidEntry(id, version, reason);
    });
  }
  revisions(actor: PracticumActor, id: string) {
    return this.store.run(actor, 'read', async (unit) => {
      await unit.entry(id);
      return unit.revisions(id);
    });
  }
}
