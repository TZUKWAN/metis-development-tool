/**
 * MDT core flow E2E (tasklist P14.11): the full design → save → reopen flow
 * against the BUILT MDT desktop app. Build first:
 *   npm run build:mdt && npx playwright test --config e2e/mdt/playwright.config.ts
 *
 * Native file dialogs (new/open/save project) cannot be automated through the
 * Electron driver, so the spec exercises the dialog-free paths:
 *  - a real project directory is created on disk through @mdt/project (the
 *    exact store module the main process uses) and opened through the welcome
 *    screen's Recent Projects list,
 *  - the designer deck feeds the MDT pages (New Page in the ribbon, then the
 *    deck→store derivation),
 *  - save/reopen is verified through the store import path (zustand store +
 *    @mdt/project save/open round-trip) and the window.mdtApi bridge state.
 *
 * Deck notes: the app boots on a fresh blank deck; "New Page" adds slide 2
 * and makes it the current slide, so the inserted MDT control lands on the
 * deck's second page.
 */
import { test, expect } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

import { openProject, saveProject } from '@mdt/project'
import type { DesignPageRef } from '@mdt/design'

import { useMdtStore } from '../../apps/mdt/src/renderer/mdt/store'
import {
  here,
  launchMdt,
  requireBuiltApp,
  closeWelcome,
  closeAppDiscardingDeck,
  createProjectOnDisk,
  seedRecentProject,
  openRecentProject,
  getMdtApi,
  getSlidesApi,
  dockTablist,
  selectDockTab,
  activateButton,
  ensureScreenshotsDir,
  screenshotsDir,
} from './helpers.mts'

const projectRoot = path.join(here, 'test-results', 'p14-11-flow-project')
const reopenRoot = path.join(here, 'test-results', 'p14-11-roundtrip-project')

let electronApp: ElectronApplication
let page: Page
let pageErrors: Error[] = []

test.beforeAll(async () => {
  requireBuiltApp()
  const launched = await launchMdt()
  electronApp = launched.electronApp
  page = launched.page
  pageErrors = []
  page.on('pageerror', (err) => pageErrors.push(err))
  await closeWelcome(page)
})

test.afterAll(async () => {
  // the deck was mutated (New Page, MDT control insert): skip the close
  // guard's native Save prompt so the app can exit cleanly
  await closeAppDiscardingDeck(electronApp)
  fs.rmSync(projectRoot, { recursive: true, force: true })
  fs.rmSync(reopenRoot, { recursive: true, force: true })
})

test('built app boots into the designer with the MDT dock (P14.11)', async () => {
  // designer canvas: the Konva stage of the blank deck that boots with the window
  await expect(page.locator('.stage-wrap .konvajs-content')).toBeVisible({ timeout: 30_000 })
  const tablist = dockTablist(page)
  for (const name of ['Agents', 'Interactions', 'Semantics', 'Build', 'Project']) {
    await expect(tablist.getByRole('tab', { name })).toBeVisible()
  }
})

test('design: New Page in the ribbon adds a deck page', async () => {
  await page.getByRole('button', { name: 'Home', exact: true }).click()
  // the Pages ribbon group always renders collapsed behind one dropdown
  await page.getByRole('button', { name: 'Pages' }).click()
  const newPage = page.getByRole('button', { name: 'New Page' })
  await expect(newPage).toBeVisible()
  await newPage.getByText('New Page', { exact: true }).click()
  await expect
    .poll(async () => (await getSlidesApi(page).getRenderSlides())?.length ?? 0, {
      timeout: 30_000,
    })
    .toBe(2)
})

test('project: create on disk (no native dialog) and open via Recent Projects', async () => {
  createProjectOnDisk(projectRoot, 'E2E Flow Project')
  await seedRecentProject(page, projectRoot)
  await openRecentProject(page, 'E2E Flow Project')
  // the default Agents panel only renders its editor once a project is loaded
  await expect(page.getByRole('button', { name: '+ New Agent' })).toBeVisible()
})

test('Semantics tab: deck pages derive into the project and get a page type', async () => {
  await selectDockTab(page, 'Semantics')
  const pageSelect = page.getByRole('combobox', { name: 'Page', exact: true })
  await expect(pageSelect).toBeVisible()
  // both designer slides derived into MDT pages with the engine's stable ids
  await expect(pageSelect.locator('option')).toHaveCount(2, { timeout: 30_000 })
  await pageSelect.selectOption({ label: 'Page 2' })
  const typeSelect = page.getByRole('combobox', { name: 'Page type', exact: true })
  await expect(typeSelect).toBeVisible()
  await typeSelect.selectOption('modal')
  await expect(typeSelect).toHaveValue('modal')
})

test('Insert tab: MDT Controls group inserts a control with role semantics', async () => {
  await page.getByRole('button', { name: 'Insert', exact: true }).click()
  // the MDT Controls group sits under the dock overlay (fixed right edge) —
  // activate it via keyboard: focus + Enter dispatch the same onClick
  const controlsButton = page.getByRole('button', { name: 'MDT Controls' })
  await expect(controlsButton).toBeVisible()
  await expect(controlsButton).toBeEnabled()
  await controlsButton.focus()
  await page.keyboard.press('Enter')
  const menu = page.locator('.rb-menu')
  await expect(menu).toBeVisible()
  await activateButton(page, menu.getByRole('button', { name: 'Button', exact: true }))
  // the insert pipeline pulls a fresh derivation: the marker element lands on
  // the current page (Page 2) with its friendly name and role applied from
  // the queued semantics
  await selectDockTab(page, 'Semantics')
  const pageSelect = page.getByRole('combobox', { name: 'Page', exact: true })
  await pageSelect.selectOption({ label: 'Page 2' })
  const elementSelect = page.getByRole('combobox', { name: 'Element', exact: true })
  await expect(elementSelect.locator('option', { hasText: 'Button (button)' })).toHaveCount(1, {
    timeout: 30_000,
  })
})

test('save → reopen round-trips the project (store import path + project IO)', async () => {
  // the renderer store module imported in the test process — the same code
  // path the app uses to derive pages from the deck
  const refs = (await getMdtApi(page).designSlides()) as DesignPageRef[]
  expect(refs.length).toBe(2)
  useMdtStore.getState().newProject('E2E Round Trip')
  useMdtStore.getState().syncFromDesign(refs)
  const withPages = useMdtStore.getState().project
  expect(withPages?.pages.map((p) => p.name)).toEqual(['Page 1', 'Page 2'])
  const modalPageId = withPages!.pages[1]!.id
  useMdtStore.getState().setNodeType(modalPageId, 'modal')

  // save through the exact store module the main process saves with …
  saveProject(reopenRoot, useMdtStore.getState().project!)
  // … and reopen through it: the mutation survived the round-trip
  const reopened = openProject(reopenRoot)
  expect(reopened.parse.ok).toBe(true)
  expect(reopened.parse.project?.pages.find((p) => p.id === modalPageId)?.type).toBe('modal')

  // the main process opens the same directory through the exposed bridge
  const bridgeOpen = await getMdtApi(page).openPath(reopenRoot)
  expect(bridgeOpen.ok).toBe(true)
  const state = await getMdtApi(page).state()
  expect(state.ok).toBe(true)
  const pages = state.project?.pages as { id: string; type: string }[] | undefined
  expect(pages?.find((p) => p.id === modalPageId)?.type).toBe('modal')
  await getMdtApi(page).close()
})

test('all dock tabs render without errors; full-app visual baseline screenshot', async () => {
  const errorsBefore = pageErrors.length
  for (const name of ['Agents', 'Interactions', 'Semantics', 'Build']) {
    await selectDockTab(page, name)
  }
  // the Project tab re-opens the welcome screen; close it back into the designer
  await dockTablist(page).getByRole('tab', { name: 'Project' }).click()
  const dialog = page.getByRole('dialog', { name: /welcome to metis development tool/i })
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: 'Start designing' }).click()
  await expect(dialog).toBeHidden()
  expect(pageErrors.slice(errorsBefore)).toEqual([])

  ensureScreenshotsDir()
  await page.screenshot({ path: path.join(screenshotsDir, 'mdt-core-flow.png') })
})
