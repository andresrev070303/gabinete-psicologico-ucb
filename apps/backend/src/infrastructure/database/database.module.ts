import { Module } from '@nestjs/common';
import { AuditedTransaction } from './audited-transaction.js';
import { DatabaseService } from './database.service.js';
import { DatabaseHealthController } from './database-health.controller.js';

@Module({
  controllers: [DatabaseHealthController],
  providers: [
    DatabaseService,
    {
      provide: AuditedTransaction,
      useFactory: (database: DatabaseService) => new AuditedTransaction(database.db),
      inject: [DatabaseService],
    },
  ],
  exports: [DatabaseService, AuditedTransaction],
})
export class DatabaseModule {}
