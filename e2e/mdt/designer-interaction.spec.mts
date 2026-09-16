/**
 * MDT designer interaction E2E (tasklist P14.12): exercises the PowerPoint-
 * style designer around the MDT dock against the BUILT desktop app. Build
 * first:
 *   npm run build:mdt && npx playwright test --config e2e/mdt/playwright.config.ts
 *
 * Covered: the Konva designer canvas, the Insert ribbon tab with its MDT
 * Controls group (the insert pipeline P06.19–P06.26 entry point), and the
 * global keyboard shortcuts (arrow-key nudge, Ctrl+Z undo, Delete).
 *
 * Deck assertions run through window.mdtApi.designSlides() — the same
 * authoritative derivation the MDT store consumes — because the deck's
 * element names (the "MDT:<role>:<uuid>" markers) only surface there.
 */
import { test, expect } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'

import {
  launchMdt,
  closeWelcome,
  closeAppDiscardingDeck,
  getMdtApi,
  dockTablist,
  selectDockTab,
  activateButton,
  type DesignRef,
} from './helpers.mts'

let electronApp: ElectronApplication
let page: Page

/** The single MDT marker element of the deck (inserted by this spec). */
async function markerElement(): Promise<DesignRef['elements'][number] | undefined> {
  const refs = (await getMdtApi(page).designSlides()) as DesignRef[]
  return refs[0]?.elements.find((el) => el.name.startsWith('MDT:'))
}

test.beforeAll(async () => {
  const launched = await launchMdt()
  electronApp = launched.electronApp
  page = launched.page
  await closeWelcome(page)
})

test.afterAll(async () => {
  // the deck is intentionally left dirty by the shortcut tests
  await closeAppDiscardingDeck(electronApp)
})

test('designer canvas (Konva stage) is visible after the welcome closes', async () => {
  const stage = page.locator('.stage-wrap .konvajs-content')
  await expect(stage).toBeVisible({ timeout: 30_000 })
  await expect(stage.locator('canvas').first()).toBeVisible()
})

test('Insert ribbon tab is present and opens the MDT Controls group (P06.19)', async () => {
  const insertTab = page.getByRole('button', { name: 'Insert', exact: true })
  await expect(insertTab).toBeVisible()
  await insertTab.click()
  // the MDT Controls group renders its label and its (enabled) dropdown button
  const group = page.locator('.ribbon-group', { has: page.getByText('MDT Controls') })
  await expect(group).toBeVisible()
  const controlsButton = page.getByRole('button', { name: 'MDT Controls' })
  await expect(controlsButton).toBeEnabled()
  // the group sits under the dock overlay (fixed right edge) — keyboard
  // activation instead of a hit-tested click
  await controlsButton.focus()
  await page.keyboard.press('Enter')
  const menu = page.locator('.rb-menu')
  await expect(menu).toBeVisible()
  for (const label of ['Button', 'Input', 'Textarea', 'Select', 'Chat', 'File picker']) {
    await expect(menu.getByRole('button', { name: label, exact: true })).toBeVisible()
  }
  // insert a Button control: queues the semantics, adds the marked engine
  // element and pulls a derivation so it lands in the MDT project
  await activateButton(page, menu.getByRole('button', { name: 'Button', exact: true }))
  await expect
    .poll(async () => (await markerElement())?.name.startsWith('MDT:button:'), {
      timeout: 30_000,
    })
    .toBe(true)
})

test('arrow keys nudge the selected control', async () => {
  const before = (await markerElement())?.geometry.x
  expect(before).toBeDefined()
  // the insert pipeline selects the new element — no click needed
  await page.keyboard.press('ArrowRight')
  await expect
    .poll(async () => (await markerElement())?.geometry.x, { timeout: 30_000 })
    .toBe(before! + 1)
})

test('Ctrl+Z undoes the nudge', async () => {
  const nudged = (await markerElement())?.geometry.x
  expect(nudged).toBeDefined()
  await page.keyboard.press('Control+z')
  await expect
    .poll(async () => (await markerElement())?.geometry.x, { timeout: 30_000 })
    .toBe(nudged! - 1)
})

test('Delete removes the selected control', async () => {
  // (re)select the control with the renderer's Tab shortcut: it cycles shape
  // selection in z-order and the deck's only shape is the inserted control
  // (the native menu's selectAll accelerator would swallow Ctrl+A)
  await page.keyboard.press('Tab')
  await page.keyboard.press('Delete')
  await expect.poll(async () => Boolean(await markerElement()), { timeout: 30_000 }).toBe(false)
  // the dock still renders fine after the deck mutations
  await selectDockTab(page, 'Semantics')
  await expect(dockTablist(page).getByRole('tab', { name: 'Semantics' })).toHaveAttribute(
    'aria-selected',
    'true',
  )
})
