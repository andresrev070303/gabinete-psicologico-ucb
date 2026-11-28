import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module.js';
import { IdentityTransactions } from '../identity/infrastructure/identity-transactions.js';
import { NotificationService } from './application/notification.service.js';
import { PostgresNotificationStore } from './infrastructure/postgres-notification.store.js';
import { PostgresNotificationWriter } from './infrastructure/postgres-notification.writer.js';
import {
  NotificationAccessPolicy,
  NotificationsController,
} from './presentation/notifications.controller.js';
@Module({
  imports: [IdentityModule],
  controllers: [NotificationsController],
  providers: [
    NotificationAccessPolicy,
    PostgresNotificationWriter,
    {
      provide: PostgresNotificationStore,
      inject: [IdentityTransactions],
      useFactory: (access: IdentityTransactions) =>
        new PostgresNotificationStore(access),
    },
    {
      provide: NotificationService,
      inject: [PostgresNotificationStore],
      useFactory: (store: PostgresNotificationStore) =>
        new NotificationService(store),
    },
  ],
  exports: [PostgresNotificationWriter],
})
export class NotificationsModule {}
