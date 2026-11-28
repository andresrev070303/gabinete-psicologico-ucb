import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module.js';
import { IdentityTransactions } from '../identity/infrastructure/identity-transactions.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { PostgresNotificationWriter } from '../notifications/infrastructure/postgres-notification.writer.js';
import { InstitutionalService } from './application/institutional.service.js';
import { PostgresInstitutionalStore } from './infrastructure/postgres-institutional.store.js';
import { InstitutionalController } from './presentation/institutional.controller.js';
import { InstitutionalAccessPolicy } from './presentation/institutional-access.policy.js';
@Module({
  imports: [IdentityModule, NotificationsModule],
  controllers: [InstitutionalController],
  providers: [
    InstitutionalAccessPolicy,
    {
      provide: PostgresInstitutionalStore,
      inject: [IdentityTransactions, PostgresNotificationWriter],
      useFactory: (
        access: IdentityTransactions,
        notifications: PostgresNotificationWriter,
      ) => new PostgresInstitutionalStore(access, notifications),
    },
    {
      provide: InstitutionalService,
      inject: [PostgresInstitutionalStore],
      useFactory: (store: PostgresInstitutionalStore) =>
        new InstitutionalService(store),
    },
  ],
})
export class InstitutionalModule {}
