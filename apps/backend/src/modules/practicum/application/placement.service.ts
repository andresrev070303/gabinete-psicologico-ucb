import type {
  NewPlacement,
  PageQuery,
  PlacementChange,
  PracticumActor,
  PracticumStore,
} from './practicum.contracts.js';
import { PracticumError } from '../domain/practicum.rules.js';

export class PlacementService {
  constructor(private readonly store: PracticumStore) {}
  catalog(actor: PracticumActor) {
    return this.store.run(actor, 'manage', (unit) => unit.catalog());
  }
  directory(actor: PracticumActor, query: PageQuery) {
    return this.store.run(actor, 'manage', (unit) => unit.directory(query));
  }
  initializeOwn(actor: PracticumActor) {
    return this.store.run(actor, 'track', async (unit) => {
      await unit.assertEligibleStudent(actor.accountId);
      return unit.ensurePlacement(actor.accountId);
    });
  }
  list(actor: PracticumActor, query: PageQuery) {
    return this.store.run(actor, 'read', (unit) => unit.listPlacements(query));
  }
  own(actor: PracticumActor, query: PageQuery) {
    return this.store.run(actor, 'read', (unit) =>
      unit.listPlacements(query, true),
    );
  }
  details(actor: PracticumActor, id: string) {
    return this.store.run(actor, 'read', (unit) => unit.placement(id));
  }
  create(actor: PracticumActor, input: NewPlacement) {
    return this.store.run(actor, 'manage', async (unit) => {
      await unit.assertEligibleStudent(input.studentAccountId);
      return unit.ensurePlacement(input.studentAccountId);
    });
  }
  update(actor: PracticumActor, id: string, input: PlacementChange) {
    return this.store.run(actor, 'manage', async (unit) => {
      const placement = await unit.placement(id, true);
      if (placement.version !== input.version)
        throw new PracticumError('version_conflict');
      if (placement.hasRunningTimer && input.status !== 'active')
        throw new PracticumError('timer_running');
      return unit.updatePlacement(id, input);
    });
  }
}
