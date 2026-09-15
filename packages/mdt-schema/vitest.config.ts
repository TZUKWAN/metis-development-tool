import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    coverage: {
    provider: 'v8',
    include: ['src/**'],
			exclude: ['src/testing.ts', 'src/**/testing.ts'],
    thresholds: { lines: 90, branches: 80, functions: 85, statements: 90 },
  },
  },
})
