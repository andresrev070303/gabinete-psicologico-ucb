import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

const backendRoot = import.meta.dirname;
const repositoryRoot = resolve(backendRoot, '../..');

export default defineConfig({
  root: backendRoot,
  resolve: { tsconfigPaths: true },
  test: {
    include: ['test/*.postgres.test.mjs'],
    exclude: ['test/audited-transaction.postgres.test.mjs'],
    fileParallelism: false,
    hookTimeout: 30000,
    testTimeout: 30000,
    coverage: {
      provider: 'v8',
      include: [
        'src/modules/identity/**/*.ts',
        'src/modules/practicum/**/*.ts',
        'src/modules/institutional/**/*.ts',
        'src/modules/notifications/**/*.ts',
      ],
      exclude: ['src/**/*.spec.ts'],
      reportsDirectory: './coverage/postgres',
      reporter: ['text', ['lcov', { projectRoot: repositoryRoot }]],
    },
  },
});
