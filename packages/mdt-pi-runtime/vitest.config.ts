import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**'],
      exclude: ['src/testing.ts', 'src/**/testing.ts'],
      thresholds: { lines: 80, branches: 75, functions: 75, statements: 80 },
    },
  },
})
