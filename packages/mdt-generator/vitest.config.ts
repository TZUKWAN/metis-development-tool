import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    // golden/determinism/lint/patch tests are pure; standalone/template tests
    // shell out to npm and carry their own generous timeouts.
    testTimeout: 600_000,
    hookTimeout: 600_000,
  },
})
