import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    coverage: {
    provider: 'v8',
    include: ['src/**'],
			exclude: ['src/testing.ts', 'src/**/testing.ts'],
    thresholds: { lines: 85, branches: 80, functions: 80, statements: 85 },
  },
  },
})
