import { IdentityTransactions } from '../../identity/infrastructure/identity-transactions.js';
import { IdentityOperationError } from '../../identity/application/account-management.contracts.js';
import type {
  PracticumActor,
  PracticumStore,
  PracticumUnitOfWork,
} from '../application/practicum.contracts.js';
import { assertAccess, PracticumError } from '../domain/practicum.rules.js';
import type { PracticumOperation } from '../domain/practicum.rules.js';
import { PostgresPracticumUnitOfWork } from './postgres-practicum.unit-of-work.js';

function databaseCode(error: unknown): { code?: string; constraint?: string } {
  let current = error;
  for (
    let depth = 0;
    depth < 5 && current && typeof current === 'object';
    depth++
  ) {
    if ('code' in current && typeof current.code === 'string')
      return {
        code: current.code,
        constraint:
          'constraint' in current && typeof current.constraint === 'string'
            ? current.constraint
            : undefined,
      };
    current = 'cause' in current ? current.cause : null;
  }
  return {};
}
export class PostgresPracticumStore implements PracticumStore {
  constructor(private readonly access: IdentityTransactions) {}
  async run<T>(
    actor: PracticumActor,
    operation: PracticumOperation,
    work: (unit: PracticumUnitOfWork) => Promise<T>,
  ): Promise<T> {
    try {
      return await this.access.runVerified(
        actor,
        { mutation: operation !== 'read', governance: false, recent: false },
        async (transaction, state) => {
          const identity = {
            accountId: actor.accountId,
            roles: state.roles,
            permissions: state.permissions,
          };
          assertAccess(identity, operation);
          return work(
            new PostgresPracticumUnitOfWork(
              transaction,
              identity,
              state.checkedAt,
            ),
          );
        },
      );
    } catch (error) {
      if (error instanceof PracticumError) throw error;
      if (error instanceof IdentityOperationError)
        throw new PracticumError(
          error.kind === 'forbidden' ? 'forbidden' : 'unavailable',
        );
      const { code, constraint } = databaseCode(error);
      if (code === '23P01') throw new PracticumError('overlap');
      if (code === '23505')
        throw new PracticumError(
          constraint === 'one_running_practice_timer'
            ? 'timer_running'
            : 'duplicate',
        );
      if (code === '23514') throw new PracticumError('invalid_period');
      throw new PracticumError('unavailable');
    }
  }
}
