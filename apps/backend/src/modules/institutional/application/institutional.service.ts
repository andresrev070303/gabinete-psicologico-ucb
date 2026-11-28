import type { AuditContext } from '../../../infrastructure/database/audited-transaction.js';
import {
  InstitutionalError,
  assertTransition,
  assertEditable,
  canManageInstitutional,
  validatePeriod,
} from '../domain/institutional.rules.js';
import type {
  InstitutionalStore,
  ListQuery,
  NewRecord,
  RecordKey,
  RecordChange,
  StatusChange,
} from './institutional.contracts.js';

export class InstitutionalService {
  constructor(private readonly store: InstitutionalStore) {}
  list(actor: AuditContext, query: ListQuery) {
    return this.store.run(actor, false, (unit) => unit.list(query));
  }
  details(actor: AuditContext, key: RecordKey) {
    return this.store.run(actor, false, (unit) => unit.details(key));
  }
  catalog(actor: AuditContext) {
    return this.store.run(actor, true, (unit) => unit.catalog());
  }
  create(actor: AuditContext, input: NewRecord) {
    validatePeriod(input.kind, input.startsAt, input.endsAt);
    return this.store.run(actor, true, async (unit) => {
      await unit.validateReferences(input);
      return unit.create(input);
    });
  }
  update(actor: AuditContext, key: RecordKey, input: RecordChange) {
    if (key.kind !== input.kind) throw new InstitutionalError('invalid_input');
    validatePeriod(input.kind, input.startsAt, input.endsAt);
    return this.store.run(actor, true, async (unit) => {
      const current = await unit.details(key, true);
      if (current.record.version !== input.version)
        throw new InstitutionalError('version_conflict');
      assertEditable(key.kind, current.record.status, input.startsAt, unit.now);
      await unit.validateReferences(input);
      return unit.update(key, input);
    });
  }
  changeStatus(actor: AuditContext, key: RecordKey, input: StatusChange) {
    return this.store.run(actor, true, async (unit) => {
      const current = await unit.details(key, true);
      if (current.record.version !== input.version)
        throw new InstitutionalError('version_conflict');
      assertTransition(
        key.kind,
        current.record.status,
        input.status,
        current.record.startsAt,
        unit.now,
      );
      return unit.changeStatus(key, input);
    });
  }
  archive(
    actor: AuditContext,
    key: RecordKey,
    version: number,
    reason: string,
  ) {
    return this.store.run(actor, true, async (unit) => {
      const current = await unit.details(key, true);
      if (current.record.version !== version)
        throw new InstitutionalError('version_conflict');
      return unit.archive(key, version, reason);
    });
  }
  createInstitution(
    actor: AuditContext,
    input: { id: string; name: string; kind: string },
  ) {
    return this.store.run(actor, true, (unit) => {
      if (!canManageInstitutional(unit.identity))
        throw new InstitutionalError('forbidden');
      return unit.createInstitution(input);
    });
  }
}
