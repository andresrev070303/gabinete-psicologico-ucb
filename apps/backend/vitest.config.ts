import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

const backendRoot = import.meta.dirname;
const repositoryRoot = resolve(backendRoot, '../..');

export default defineConfig({
  root: backendRoot,
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    include: ['src/**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.spec.ts',
        'src/**/*.test.ts',
        'src/**/*.d.ts',
        'src/infrastructure/database/schema.ts',
        'src/infrastructure/database/relations.ts',
      ],
      reportsDirectory: './coverage',
      reporter: [
        'text',
        'html',
        ['lcov', { projectRoot: repositoryRoot }],
      ],
    },
  },
});