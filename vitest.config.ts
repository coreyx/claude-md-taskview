import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // `claude plugin test .` runs every *.test.ts in the repo and cannot import vitest,
    // so the vitest files are *.spec.ts and the mod's own tests are hooks/*.test.ts.
    include: ['core/**/*.spec.ts'],
    environment: 'node',
  },
});
