import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { AuditedTransaction } from '../src/infrastructure/database/audited-transaction.js';
import { DatabaseService } from '../src/infrastructure/database/database.service.js';

describe('Application HTTP endpoints', () => {
  let app: INestApplication<App>;
  const database = {
    checkConnection: vi.fn<DatabaseService['checkConnection']>(),
  };

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(DatabaseService)
      .useValue(database)
      .overrideProvider(AuditedTransaction)
      .useValue({
        run: () => {
          throw new Error('Database writes are not configured in HTTP smoke tests.');
        },
      })
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  beforeEach(() => {
    database.checkConnection.mockReset().mockResolvedValue(undefined);
  });

  afterAll(async () => {
    await app?.close();
  });

  it('returns the root response', async () => {
    await request(app.getHttpServer()).get('/').expect(200).expect('Hello World!');
  });

  it('reports backend health without checking PostgreSQL', async () => {
    await request(app.getHttpServer()).get('/health').expect(200).expect({ status: 'ok' });
    expect(database.checkConnection).not.toHaveBeenCalled();
  });

  it('reports a successful PostgreSQL connection check', async () => {
    await request(app.getHttpServer())
      .get('/health/database')
      .expect(200)
      .expect({ status: 'ok', database: 'connected' });
    expect(database.checkConnection).toHaveBeenCalledOnce();
  });

  it('reports unavailable PostgreSQL without exposing internal error details', async () => {
    const internalDetails = 'Internal PostgreSQL connection failure';
    database.checkConnection.mockRejectedValueOnce(new Error(internalDetails));

    const response = await request(app.getHttpServer()).get('/health/database').expect(503);

    expect(response.body).toMatchObject({ statusCode: 503, error: 'Service Unavailable' });
    expect(JSON.stringify(response.body)).not.toContain(internalDetails);
  });
});
