import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PracticeWorkService } from './practice-work.service.js';
import type {
  Placement,
  PracticeTask,
  PracticumActor,
  PracticumStore,
  PracticumUnitOfWork,
  TimeEntry,
} from './practicum.contracts.js';
const actor: PracticumActor = {
  accountId: 'student',
  authSessionId: 'session',
  requestId: 'request',
};
const placement = {
  id: 'placement',
  studentAccountId: 'student',
  status: 'active',
  version: 1,
} as Placement;
const task = {
  id: 'task',
  placementId: 'placement',
  status: 'active',
} as PracticeTask;
const entry = {
  id: 'entry',
  placementId: 'placement',
  taskId: 'task',
  startedAt: '2026-11-27T14:00:00Z',
  endedAt: null,
  source: 'timer',
  version: 1,
  voidedAt: null,
} as TimeEntry;
function fakeOperations() {
  return {
    placement: vi.fn().mockResolvedValue(placement),
    task: vi.fn().mockResolvedValue(task),
    entry: vi.fn().mockResolvedValue(entry),
    insertEntry: vi.fn().mockResolvedValue(entry),
    stopEntry: vi
      .fn()
      .mockResolvedValue({ ...entry, endedAt: '2026-11-27T15:00:00Z' }),
    editEntry: vi.fn().mockResolvedValue(entry),
    voidEntry: vi.fn().mockResolvedValue(entry),
    resolveEntryTask: vi.fn().mockResolvedValue(task),
    createTask: vi.fn().mockResolvedValue(task),
    updateTask: vi.fn().mockResolvedValue(task),
  };
}
describe('Practice work application', () => {
  let unit: PracticumUnitOfWork;
  let operations: ReturnType<typeof fakeOperations>;
  let service: PracticeWorkService;
  beforeEach(() => {
    operations = fakeOperations();
    unit = {
      identity: {
        accountId: 'student',
        roles: ['assistant'],
        permissions: ['practicum.track_own', 'practicum.read_own'],
      },
      now: '2026-11-27T15:00:00Z',
      ...operations,
    } as unknown as PracticumUnitOfWork;
    const store: PracticumStore = {
      async run(_actor, _operation, work) {
        return work(unit);
      },
    };
    service = new PracticeWorkService(store);
  });
  it('starts a timer using server time and never asks for approval', async () => {
    await service.start(actor, 'placement', {
      id: 'entry',
      taskId: 'task',
      description: null,
    });
    expect(operations.insertEntry).toHaveBeenCalledWith(
      placement,
      task,
      expect.objectContaining({
        startedAt: '2026-11-27T15:00:00.000Z',
        endedAt: null,
        source: 'timer',
      }),
    );
  });
  it('forbids student status changes but lets them edit entry details without changing time', async () => {
    await expect(
      service.updateTask(actor, 'placement', 'task', {
        status: 'completed',
        version: 1,
        reason: null,
      }),
    ).rejects.toMatchObject({ code: 'forbidden' });
    const input = {
      title: 'Workshop materials',
      projectLabel: 'Community',
      description: 'Prepare handouts',
      version: 1,
    };
    await service.edit(actor, 'entry', input);
    expect(operations.editEntry).toHaveBeenCalledExactlyOnceWith(
      'entry',
      task,
      input,
    );
    expect(operations.stopEntry).not.toHaveBeenCalled();
    expect(operations.insertEntry).not.toHaveBeenCalled();
  });
  it('resumes entry details in a new timer without changing the source interval', async () => {
    operations.entry.mockResolvedValue({
      ...entry,
      taskTitle: 'Workshop',
      projectLabel: 'Community',
      description: 'Materials',
      endedAt: '2026-11-27T14:30:00Z',
    });
    await service.resume(actor, 'entry', { id: 'resumed' });
    expect(operations.resolveEntryTask).toHaveBeenCalledWith('placement', {
      title: 'Workshop',
      projectLabel: 'Community',
      description: 'Materials',
    });
    expect(operations.insertEntry).toHaveBeenCalledWith(placement, task, {
      id: 'resumed',
      startedAt: unit.now,
      endedAt: null,
      description: 'Materials',
      source: 'timer',
    });
    expect(operations.editEntry).not.toHaveBeenCalled();
  });
  it('uses the click time instead of transaction completion time when stopping', async () => {
    await service.stop(actor, 'entry', { stoppedAt: '2026-11-27T14:59:20Z' });
    expect(operations.stopEntry).toHaveBeenCalledExactlyOnceWith(
      'entry',
      '2026-11-27T14:59:20.000Z',
    );
  });
  it.each([
    '2026-11-27T13:59:59Z',
    '2026-11-27T14:50:00Z',
    '2026-11-27T15:01:00Z',
    'invalid',
  ])('rejects an arbitrary stop time %s', async (stoppedAt) => {
    await expect(
      service.stop(actor, 'entry', { stoppedAt }),
    ).rejects.toMatchObject({ code: 'invalid_period' });
    expect(operations.stopEntry).not.toHaveBeenCalled();
  });
  it('rejects time recording for a different person', async () => {
    vi.mocked(operations.placement).mockResolvedValue({
      ...placement,
      studentAccountId: 'another-student',
    });
    await expect(
      service.start(actor, 'placement', {
        id: 'entry',
        taskId: 'task',
        description: null,
      }),
    ).rejects.toMatchObject({ code: 'forbidden' });
    expect(operations.insertEntry).not.toHaveBeenCalled();
  });
  it('rejects a closed practice or completed task', async () => {
    vi.mocked(operations.placement).mockResolvedValueOnce({
      ...placement,
      status: 'completed',
    });
    await expect(
      service.start(actor, 'placement', {
        id: 'entry',
        taskId: 'task',
        description: null,
      }),
    ).rejects.toMatchObject({ code: 'inactive_placement' });
    vi.mocked(operations.task).mockResolvedValueOnce({
      ...task,
      status: 'completed',
    });
    await expect(
      service.start(actor, 'placement', {
        id: 'entry',
        taskId: 'task',
        description: null,
      }),
    ).rejects.toMatchObject({ code: 'inactive_task' });
  });
  it('makes stop retries return the existing interval without adding time', async () => {
    vi.mocked(operations.entry).mockResolvedValue({
      ...entry,
      endedAt: '2026-11-27T14:30:00Z',
    });
    const result = await service.stop(actor, 'entry');
    expect(result.endedAt).toBe('2026-11-27T14:30:00Z');
    expect(operations.stopEntry).not.toHaveBeenCalled();
  });
  it('stops a timer and persists its end with the same transaction', async () => {
    await service.stop(actor, 'entry');
    expect(operations.stopEntry).toHaveBeenCalledExactlyOnceWith(
      'entry',
      '2026-11-27T15:00:00.000Z',
    );
  });
  it('refuses stale corrections before writing', async () => {
    await expect(
      service.edit(actor, 'entry', {
        title: 'Edited activity',
        projectLabel: 'Gabinete',
        description: null,
        version: 2,
      }),
    ).rejects.toMatchObject({ code: 'version_conflict' });
    expect(operations.editEntry).not.toHaveBeenCalled();
  });
  it('keeps the director read-only for student entries', async () => {
    Object.defineProperty(unit, 'identity', {
      value: {
        accountId: 'director',
        roles: ['director'],
        permissions: ['practicum.manage'],
      },
    });
    vi.mocked(operations.placement).mockResolvedValue({
      ...placement,
      status: 'completed',
    });
    const input = {
      title: 'Edited activity',
      projectLabel: 'Gabinete',
      description: null,
      version: 1,
    };
    await expect(service.edit(actor, 'entry', input)).rejects.toMatchObject({
      code: 'forbidden',
    });
    await expect(
      service.void(actor, 'entry', 1, 'Delete a record'),
    ).rejects.toMatchObject({ code: 'forbidden' });
    expect(operations.editEntry).not.toHaveBeenCalled();
    expect(operations.voidEntry).not.toHaveBeenCalled();
    await expect(
      service.start(actor, 'placement', {
        id: 'entry',
        taskId: 'task',
        description: null,
      }),
    ).rejects.toMatchObject({ code: 'forbidden' });
  });
});
