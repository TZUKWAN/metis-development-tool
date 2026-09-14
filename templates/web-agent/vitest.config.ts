import { defineConfig } from 'vitest/config'

// Unit tests run in jsdom (browser APIs: localStorage) except server tests,
// which opt into node via a `@vitest-environment node` docblock. E2E tests
// live in Playwright (playwright.config.ts), not here.
export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'jsdom',
  },
})
