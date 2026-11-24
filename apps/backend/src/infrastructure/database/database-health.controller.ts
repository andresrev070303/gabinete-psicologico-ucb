import {
  Controller,
  Get,
  ServiceUnavailableException,
} from '@nestjs/common';
import { DatabaseService } from './database.service.js';

@Controller('health')
export class DatabaseHealthController {
  constructor(private readonly database: DatabaseService) {}

  @Get()
  checkBackend() {
    return { status: 'ok' };
  }

  @Get('database')
  async checkDatabase() {
    try {
      await this.database.checkConnection();

      return {
        status: 'ok',
        database: 'connected',
      };
    } catch {
      throw new ServiceUnavailableException(
        'No se pudo verificar la conexión con PostgreSQL.',
      );
    }
  }
}