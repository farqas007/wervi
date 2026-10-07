import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // `src` only, so the compiled copies in `dist` are not collected twice.
    include: ['src/**/*.test.ts'],
    // The integration suites share one test database: each migrates it in
    // `beforeAll` and truncates every table in `beforeEach`. Running test files
    // concurrently lets those steps collide — two migrators racing produce
    // `duplicate key ... pg_type_typname_nsp_index`, and one suite's truncate
    // deletes the other's rows mid-test. Files therefore run one at a time;
    // tests within a file were already sequential, and the suites still skip
    // when no safe test database is configured, so a local run without a test
    // database is unchanged.
    fileParallelism: false,
  },
});
