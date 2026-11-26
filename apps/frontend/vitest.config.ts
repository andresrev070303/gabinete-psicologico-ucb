import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

const frontendRoot = import.meta.dirname;
const repositoryRoot = resolve(frontendRoot, '../..');

export default defineConfig({
  root: frontendRoot,
  test: {
    include: ['src/**/*.spec.ts', 'src/**/*.spec.tsx'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts', 'src/**/*.tsx'],
      exclude: ['src/**/*.spec.ts', 'src/**/*.spec.tsx', 'src/**/*.d.ts'],
      reportsDirectory: './coverage',
      reporter: ['text', 'html', ['lcov', { projectRoot: repositoryRoot }]],
    },
  },
});
