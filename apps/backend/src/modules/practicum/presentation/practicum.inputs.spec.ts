import { describe, expect, it } from 'vitest';
import {
  PracticumInputPipe,
  parseStopTimer,
  parsePage,
  parseEntryChange,
  parsePlacement,
  parsePlacementChange,
  parseTask,
  parseVoidEntry,
} from './practicum.inputs.js';
const id = '947043ea-4695-4a4e-a06b-e602cedd26e1';
describe('Practice request validation', () => {
  it('rejects client-supplied authorship and approval fields', () => {
    const pipe = new PracticumInputPipe(parseStopTimer);
    expect(() =>
      pipe.transform({
        id,
        taskId: id,
        startedAt: '2026-11-27T10:00:00Z',
        endedAt: '2026-11-27T11:00:00Z',
        approved: true,
      }),
    ).toThrow();
    expect(() =>
      parseTask({
        id,
        title: 'Task',
        projectLabel: 'Gabinete',
        activityKind: 'administration',
        startTimer: false,
        actorAccountId: id,
      }),
    ).toThrow();
  });
  it('accepts an account without a supervisor and two practice states', () => {
    expect(parsePlacement({ studentAccountId: id })).toEqual({
      studentAccountId: id,
    });
    expect(() =>
      parsePlacement({ studentAccountId: id, supervisorAccountId: id }),
    ).toThrow();
    expect(() =>
      parsePlacementChange({
        status: 'planned',
        version: 1,
        reason: 'Changed status',
      }),
    ).toThrow();
    expect(
      parsePlacementChange({
        status: 'completed',
        version: 1,
        reason: 'Practice finished',
      }).status,
    ).toBe('completed');
  });
  it('rejects removed academic fields and a nonempty void reason is required', () => {
    expect(() =>
      parsePlacement({
        studentAccountId: id,

        termId: id,
        kind: 'intern',
        status: 'active',
        startsOn: '2026-02-30',
        endsOn: '2026-12-31',
      }),
    ).toThrow();
    expect(() => parseVoidEntry({ version: 1, reason: '' })).toThrow();
    expect(() =>
      parseVoidEntry({ version: 0, reason: 'Incorrect period' }),
    ).toThrow();
  });
  it('accepts a bounded stop timestamp or an empty legacy request', () => {
    expect(parseStopTimer({})).toEqual({ stoppedAt: null });
    expect(parseStopTimer({ stoppedAt: '2026-11-27T10:00:00Z' })).toEqual({
      stoppedAt: '2026-11-27T10:00:00.000Z',
    });
    expect(() => parseStopTimer({ stoppedAt: '2026-11-27T10:00' })).toThrow();
  });
  it('bounds pagination and accepts only offset-aware times', () => {
    expect(parsePage({})).toEqual({ cursor: null, limit: 20 });
    expect(() => parsePage({ limit: '10000' })).toThrow();
    expect(() =>
      parseStopTimer({
        id,
        taskId: id,
        startedAt: '2026-11-27T10:00',
        endedAt: '2026-11-27T11:00',
      }),
    ).toThrow();
  });
  it('accepts only entry labels and rejects attempts to edit time or author fields', () => {
    const input = {
      title: 'Workshop materials',
      projectLabel: 'Community',
      description: null,
      version: 1,
    };
    expect(parseEntryChange(input)).toEqual(input);
    for (const field of [
      'startedAt',
      'endedAt',
      'durationSeconds',
      'accountId',
      'taskId',
      'reason',
    ])
      expect(() =>
        parseEntryChange({ ...input, [field]: 'forbidden' }),
      ).toThrow();
  });
});
