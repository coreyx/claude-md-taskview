import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // hooks/*.test.ts run under `claude plugin test .`, not vitest.
    include: ['core/**/*.test.ts'],
    environment: 'node',
  },
});
