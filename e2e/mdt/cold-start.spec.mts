/**
 * Cold-start measurement for docs/testing/performance-baseline.md.
 * Run: npx playwright test --config e2e/mdt/playwright.config.ts e2e/mdt/cold-start.measure.ts
 */
import { test } from '@playwright/test'
import { _electron as electron } from 'playwright-core'
import path from 'node:path'
import url from 'node:url'
import { writeFileSync } from 'node:fs'

const here = path.dirname(url.fileURLToPath(import.meta.url))
const appDir = path.resolve(here, '../../apps/mdt')

test('measure cold start', async () => {
  const runs: number[] = []
  for (let i = 0; i < 3; i++) {
    const t0 = Date.now()
    const app = await electron.launch({ args: [path.join(appDir, 'out', 'main', 'index.js')], cwd: appDir })
    const win = await app.firstWindow()
    await win.waitForLoadState('domcontentloaded')
    await win.waitForSelector('#root *', { timeout: 60_000 })
    runs.push(Date.now() - t0)
    await app.close()
  }
  const report = {
    date: new Date().toISOString(),
    platform: process.platform,
    node: process.version,
    runsMs: runs,
    medianMs: runs.sort((a, b) => a - b)[Math.floor(runs.length / 2)],
  }
  writeFileSync(path.join(here, 'cold-start.json'), JSON.stringify(report, null, 2))
  console.log('COLD_START', JSON.stringify(runs))
})
