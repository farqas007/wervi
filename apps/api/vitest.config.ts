import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    pool: 'forks',
    // Every API test file drives the same `wervi_test` database and truncates
    // it (resetDatabase) in beforeEach. Running them in parallel races those
    // resets against in-flight requests, so files must run one at a time.
    fileParallelism: false,
  },
});
