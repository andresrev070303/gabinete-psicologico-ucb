import { ConfigService } from '@nestjs/config';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DatabaseService } from './database.service.js';

const connection = vi.hoisted(() => ({
  execute: vi.fn(),
  end: vi.fn(),
  on: vi.fn(),
}));

vi.mock('pg', () => ({
  Pool: class {
    on = connection.on;
    end = connection.end;
  },
}));

vi.mock('drizzle-orm/node-postgres', () => ({
  drizzle: () => ({ execute: connection.execute }),
}));

describe('DatabaseService', () => {
  let database: DatabaseService;

  beforeEach(() => {
    vi.resetAllMocks();
    connection.end.mockResolvedValue(undefined);
    connection.execute.mockResolvedValue({
      rows: [{ database_name: 'gabinete_ucb', role_name: 'gabinete_app' }],
    });
    database = new DatabaseService(new ConfigService({
      DATABASE_URL: 'postgresql://localhost/gabinete_test',
    }));
  });

  afterEach(async () => {
    await database.onModuleDestroy();
  });

  it('accepts the expected database and application role', async () => {
    await expect(database.checkConnection()).resolves.toBeUndefined();
  });

  it.each([
    { database_name: 'another_database', role_name: 'gabinete_app' },
    { database_name: 'gabinete_ucb', role_name: 'neondb_owner' },
    { database_name: 'another_database', role_name: 'another_role' },
  ])('rejects an unexpected connection identity: %j', async (identity) => {
    connection.execute.mockResolvedValueOnce({ rows: [identity] });

    await expect(database.checkConnection()).rejects.toThrow(
      'The connection does not use the expected database and runtime role.',
    );
  });

  it('rejects a connection check without an identity result', async () => {
    connection.execute.mockResolvedValueOnce({ rows: [] });

    await expect(database.checkConnection()).rejects.toThrow(
      'The connection does not use the expected database and runtime role.',
    );
  });

  it('propagates a failed probe so the health endpoint can report unavailability', async () => {
    const failure = new Error('Connection probe failed');
    connection.execute.mockRejectedValueOnce(failure);

    await expect(database.checkConnection()).rejects.toBe(failure);
  });
});
