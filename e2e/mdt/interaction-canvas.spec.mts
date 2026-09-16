/**
 * MDT interaction canvas E2E (tasklist P07.24, P14.13): the @xyflow/react
 * graph editor inside the dock's Interactions tab, against the BUILT desktop
 * app. Build first:
 *   npm run build:mdt && npx playwright test --config e2e/mdt/playwright.config.ts
 *
 * The canvas only renders for an open project (pages derive from the deck),
 * so the spec creates a project on disk through @mdt/project and opens it
 * through the welcome screen's Recent Projects list — native dialogs cannot
 * be automated in the Electron driver.
 */
import { test, expect } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

import {
  here,
  launchMdt,
  requireBuiltApp,
  closeWelcome,
  createProjectOnDisk,
  seedRecentProject,
  openRecentProject,
  selectDockTab,
} from './helpers.mts'

const projectRoot = path.join(here, 'test-results', 'p07-24-canvas-project')

let electronApp: ElectronApplication
let page: Page

test.beforeAll(async () => {
  requireBuiltApp()
  const launched = await launchMdt()
  electronApp = launched.electronApp
  page = launched.page
  await closeWelcome(page)
  createProjectOnDisk(projectRoot, 'E2E Canvas Project')
  await seedRecentProject(page, projectRoot)
  await openRecentProject(page, 'E2E Canvas Project')
  await selectDockTab(page, 'Interactions')
})

test.afterAll(async () => {
  await electronApp.close()
  fs.rmSync(projectRoot, { recursive: true, force: true })
})

test('Interactions tab renders the React Flow canvas with the derived page node (P07)', async () => {
  const flow = page.locator('.react-flow')
  await expect(flow).toBeVisible({ timeout: 30_000 })
  // the blank deck's single slide derived into one page node — the visible
  // <strong> title row carries the derived page name. Use a generous timeout
  // because the deck→derive→render pipeline is async.
  await expect(flow.locator('strong', { hasText: /Page|页/ }).first()).toBeVisible({
    timeout: 20_000,
  })
})

test('the MiniMap renders inside the canvas', async () => {
  await expect(page.locator('.react-flow__minimap')).toBeVisible()
})

test('the node search input is present and usable', async () => {
  const search = page.getByRole('textbox', { name: 'Search nodes' })
  await expect(search).toBeVisible()
  // searching for an existing page and pressing Enter centers the viewport —
  // the canvas must stay intact afterwards
  await search.fill('Page 1')
  await search.press('Enter')
  await expect(page.locator('.react-flow')).toBeVisible()
  await expect(page.locator('.react-flow__minimap')).toBeVisible()
})

test('the lint bar renders and expands to the issue list (P07.22)', async () => {
  const lintToggle = page.getByRole('button', { name: /Lint/ })
  await expect(lintToggle).toBeVisible()
  // a fresh project has no interactions, hence a clean graph
  await expect(page.getByText('0 errors')).toBeVisible()
  await expect(page.getByText('0 warnings')).toBeVisible()
  await lintToggle.click()
  await expect(page.getByText('No issues')).toBeVisible()
  await lintToggle.click()
})
