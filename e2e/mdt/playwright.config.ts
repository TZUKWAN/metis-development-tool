import { defineConfig } from '@playwright/test'

/**
 * MDT desktop E2E (tasklist P14.11): drives the BUILT MDT app
 * (apps/mdt/out) via Playwright's Electron driver. Serial on purpose —
 * parallel Electron instances fight over the GPU cache.
 */
export default defineConfig({
  testDir: '.',
  outputDir: './test-results',
  timeout: 90_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: { trace: 'retain-on-failure' },
})
