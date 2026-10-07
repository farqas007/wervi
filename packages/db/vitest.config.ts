import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // `src` only, so the compiled copies in `dist` are not collected twice.
    include: ['src/**/*.test.ts'],
  },
});
