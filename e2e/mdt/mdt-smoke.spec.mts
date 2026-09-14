/**
 * MDT app E2E smoke (tasklist P14.11): launches the built MDT desktop app,
 * verifies the MDT surface is present (welcome screen, dock tabs), and
 * exercises the project menu. Runs against apps/mdt/out — build first:
 *   npm run build:mdt && npx playwright test --config e2e/mdt/playwright.config.ts
 */
import { test, expect, type Page } from '@playwright/test'
import { _electron as electron, type ElectronApplication } from 'playwright-core'
import path from 'node:path'
import url from 'node:url'

const here = path.dirname(url.fileURLToPath(import.meta.url))
const appDir = path.resolve(here, '../../apps/mdt')
const mainJs = path.join(appDir, 'out', 'main', 'index.js')

let electronApp: ElectronApplication
let page: Page

test.beforeAll(async () => {
  electronApp = await electron.launch({
    args: [mainJs],
    cwd: appDir,
  })
  page = await electronApp.firstWindow()
  await page.waitForLoadState('domcontentloaded')
})

test.afterAll(async () => {
  await electronApp.close()
})

test('app boots with the MDT welcome screen (P03.12)', async () => {
  const dialog = page.getByRole('dialog', { name: /welcome to metis development tool/i })
  await expect(dialog).toBeVisible({ timeout: 30_000 })
  await expect(dialog.getByRole('heading', { name: 'New Project' })).toBeVisible()
  await expect(dialog.getByRole('heading', { name: 'Open Project' })).toBeVisible()
  await expect(dialog.getByRole('heading', { name: 'Recent Projects' })).toBeVisible()
  await expect(dialog.getByRole('heading', { name: 'Docs' })).toBeVisible()
})

test('welcome screen closes into the designer (Start designing)', async () => {
  await page.getByRole('button', { name: 'Start designing' }).click()
  await expect(
    page.getByRole('dialog', { name: /welcome to metis development tool/i }),
  ).toBeHidden()
})

test('MDT dock exposes Agents / Interactions / Semantics / Build tabs (P06.01)', async () => {
  const tablist = page.getByRole('tablist', { name: 'MDT tools' })
  await expect(tablist).toBeVisible()
  for (const name of ['Agents', 'Interactions', 'Semantics', 'Build']) {
    await expect(tablist.getByRole('tab', { name })).toBeVisible()
  }
  await tablist.getByRole('tab', { name: 'Build' }).click()
  await expect(page.getByText('Open a project first.')).toBeVisible()
})
