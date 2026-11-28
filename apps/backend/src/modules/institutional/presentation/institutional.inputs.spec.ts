import { describe, expect, it } from 'vitest';
import {
  parseNewRecord,
  parseRecordChange,
  parseList,
  parseStatus,
} from './institutional.inputs.js';
const id = '10000000-0000-4000-8000-000000000001';
const input = {
  id,
  kind: 'activity',
  type: 'talk',
  title: 'An example talk',
  description: null,
  startsAt: '2026-12-01T09:00:00-04:00',
  endsAt: '2026-12-01T11:00:00-04:00',
  institutionId: null,
  responsibleAccountId: id,
  memberAccountIds: [],
  projectId: null,
  agreementId: null,
  code: null,
  venue: null,
};
describe('Institutional request validation', () => {
  it('normalizes dates and preserves optional links', () => {
    expect(parseNewRecord(input)).toMatchObject({
      kind: 'activity',
      startsAt: '2026-12-01T13:00:00.000Z',
      projectId: null,
      agreementId: null,
    });
  });
  it.each([
    { actorAccountId: id },
    { version: 1 },
    { memberAccountIds: [id, id] },
    { memberAccountIds: ['invalid'] },
    { title: 'a' },
    { startsAt: '2026-02-30T09:00:00Z' },
    { startsAt: '2026-12-01T24:00:00Z' },
    { code: 'not-for-events' },
  ])('rejects unexpected or invalid event fields %j', (extra) => {
    expect(() => parseNewRecord({ ...input, ...extra })).toThrow();
  });
  it('requires an institution for agreements and disallows event links on a project', () => {
    expect(() =>
      parseNewRecord({
        ...input,
        kind: 'agreement',
        type: 'agreement',
        startsAt: '2027-01-01',
        endsAt: null,
      }),
    ).toThrow();
    expect(
      parseNewRecord({
        ...input,
        kind: 'agreement',
        type: 'agreement',
        institutionId: id,
        startsAt: '2027-01-01',
        endsAt: null,
      }),
    ).toMatchObject({ institutionId: id, startsAt: '2027-01-01' });
    expect(() =>
      parseNewRecord({
        ...input,
        kind: 'project',
        type: 'program',
        startsAt: null,
        endsAt: null,
        agreementId: id,
      }),
    ).toThrow();
  });
  it('requires a positive version for edits and bounded counts for results', () => {
    const { id: _id, ...change } = input;
    expect(() => parseRecordChange({ ...change, version: 0 })).toThrow();
    expect(() =>
      parseStatus({
        version: 1,
        status: 'completed',
        reason: 'Activity completed',
        results: 'Good results',
        reportedParticipants: -1,
      }),
    ).toThrow();
  });
  it('validates pagination and rejects caller-supplied ownership filters', () => {
    expect(
      parseList({ limit: '20', type: 'agreement', search: ' College ' }),
    ).toMatchObject({ limit: 20, type: 'agreement', search: 'College' });
    for (const value of [
      { limit: '100' },
      { from: '2026-12-02', to: '2026-12-01' },
      { accountId: id },
      { cursor: 'invalid space' },
    ])
      expect(() => parseList(value)).toThrow();
  });
});
