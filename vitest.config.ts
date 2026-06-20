import { defineConfig } from 'vitest/config';
import path from 'node:path';

// Tests run against TypeScript source (no build step needed). The workspace
// alias points @moji/shared at its source so server/shared tests stay in sync
// with edits without rebuilding the shared package.
export default defineConfig({
  resolve: {
    alias: {
      '@moji/shared': path.resolve(import.meta.dirname, 'packages/shared/src/index.ts'),
    },
  },
  test: {
    environment: 'node',
    include: ['packages/**/src/**/*.test.ts'],
    // Keep DB-touching modules out of unit runs; we test pure logic + the
    // in-memory state machine. Integration tests against Postgres can be added
    // later under a separate project/config.
    passWithNoTests: false,
  },
});
