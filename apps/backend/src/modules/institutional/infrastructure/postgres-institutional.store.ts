import { IdentityTransactions } from '../../identity/infrastructure/identity-transactions.js';
import { IdentityOperationError } from '../../identity/application/account-management.contracts.js';
import { PostgresNotificationWriter } from '../../notifications/infrastructure/postgres-notification.writer.js';
import type { AuditContext } from '../../../infrastructure/database/audited-transaction.js';
import type {
  InstitutionalStore,
  InstitutionalUnitOfWork,
} from '../application/institutional.contracts.js';
import {
  canManageInstitutional,
  canReadInstitutional,
  InstitutionalError,
} from '../domain/institutional.rules.js';
import { PostgresInstitutionalUnitOfWork } from './postgres-institutional.unit-of-work.js';
export class PostgresInstitutionalStore implements InstitutionalStore {
  constructor(
    private readonly access: IdentityTransactions,
    private readonly notifications: PostgresNotificationWriter,
  ) {}
  async run<T>(
    actor: AuditContext,
    mutation: boolean,
    work: (unit: InstitutionalUnitOfWork) => Promise<T>,
  ): Promise<T> {
    try {
      return await this.access.runVerified(
        actor,
        { mutation, governance: false, recent: false },
        async (tx, state) => {
          const identity = {
            accountId: actor.accountId,
            roles: state.roles,
            permissions: state.permissions,
          };
          if (
            !(mutation
              ? canManageInstitutional(identity)
              : canReadInstitutional(identity))
          )
            throw new InstitutionalError('forbidden');
          return work(
            new PostgresInstitutionalUnitOfWork(
              tx,
              identity,
              state.checkedAt,
              this.notifications,
            ),
          );
        },
      );
    } catch (error) {
      if (error instanceof InstitutionalError) throw error;
      if (error instanceof IdentityOperationError)
        throw new InstitutionalError(
          error.kind === 'forbidden' ? 'forbidden' : 'unavailable',
        );
      let cause: unknown = error;
      for (
        let depth = 0;
        depth < 5 && cause && typeof cause === 'object';
        depth++
      ) {
        if ('code' in cause) {
          if (cause.code === '23505') throw new InstitutionalError('duplicate');
          if (cause.code === '23503')
            throw new InstitutionalError('invalid_reference');
          if (cause.code === '23514')
            throw new InstitutionalError('invalid_input');
        }
        cause = 'cause' in cause ? cause.cause : null;
      }
      throw new InstitutionalError('unavailable');
    }
  }
}
