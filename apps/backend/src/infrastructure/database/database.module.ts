import { Module } from '@nestjs/common';
import { DatabaseService } from './database.service.js';
import { DatabaseHealthController } from './database-health.controller.js';

@Module({
  controllers: [DatabaseHealthController],
  providers: [DatabaseService],
  exports: [DatabaseService],
})
export class DatabaseModule {}