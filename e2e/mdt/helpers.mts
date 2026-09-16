/**
 * Shared helpers for the MDT desktop E2E specs (tasklist P14.11–P14.13,
 * P14.19 expansion). Every spec launches the BUILT app (apps/mdt/out) via
 * Playwright's Electron driver — build first:
 *   npm run build:mdt && npx playwright test --config e2e/mdt/playwright.config.ts
 *
 * Native dialogs (new/open/save project) cannot be automated in the Electron
 * driver, so the specs create real project directories on disk through the
 * same @mdt/project store the main process uses, register them with the
 * app through the window.mdtApi bridge (preload), and open them through the
 * welcome screen's Recent Projects list — the dialog-free user path.
 */
import { expect, type Page } from '@playwright/test'
import { _electron as electron, type ElectronApplication } from 'playwright-core'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import url from 'node:url'

import { createProject } from '@mdt/project'

export const here = path.dirname(url.fileURLToPath(import.meta.url))
export const appDir = path.resolve(here, '../../apps/mdt')
export const mainJs = path.join(appDir, 'out', 'main', 'index.js')
export const screenshotsDir = path.join(here, 'screenshots')

/** DesignPageRef shape (deck → MDT derivation input) used in deck assertions. */
export interface DesignRef {
  slideId: string
  index: number
  name: string
  elements: {
    sourceId: string
    name: string
    kind: string
    geometry: { x: number; y: number; width: number; height: number }
  }[]
}

/** Minimal shape of the contextBridge surface exposed by the MDT preload. */
export interface MdtBridge {
  openPath(root: string): Promise<{ ok?: boolean; error?: string; project?: unknown }>
  close(): Promise<unknown>
  state(): Promise<{
    ok?: boolean
    root?: string
    project?: Record<string, unknown>
    dirty?: boolean
    error?: string
  }>
  designSlides(): Promise<unknown>
}

/** Shape of the slides-engine bridge needed for deck assertions. */
export interface SlidesBridge {
  getRenderSlides(): Promise<
    { nodes: { sourceId: string; box: { x: number; y: number; w: number; h: number } }[] }[] | null
  >
}

/**
 * Proxies over the contextBridge surfaces exposed in the page (window.mdtApi
 * / window.slidesApi). The Playwright `Page` wrapper has no such fields —
 * every call is evaluated inside the renderer.
 */
export function getMdtApi(page: Page): MdtBridge {
  return {
    openPath: (root) =>
      page.evaluate(
        (root) => (window as unknown as { mdtApi: MdtBridge }).mdtApi.openPath(root),
        root,
      ),
    close: () => page.evaluate(() => (window as unknown as { mdtApi: MdtBridge }).mdtApi.close()),
    state: () => page.evaluate(() => (window as unknown as { mdtApi: MdtBridge }).mdtApi.state()),
    designSlides: () =>
      page.evaluate(() => (window as unknown as { mdtApi: MdtBridge }).mdtApi.designSlides()),
  }
}

export function getSlidesApi(page: Page): SlidesBridge {
  return {
    getRenderSlides: () =>
      page.evaluate(() =>
        (window as unknown as { slidesApi: SlidesBridge }).slidesApi.getRenderSlides(),
      ),
  }
}

/** Fail fast (with an actionable message) when the app was not built. */
export function requireBuiltApp(): void {
  if (!existsSync(mainJs)) {
    throw new Error(
      `MDT app is not built — run "npm run build:mdt" before the MDT e2e suite (missing ${mainJs})`,
    )
  }
}

/**
 * Launch the built MDT app. GENOFFICE_LANG pins the UI language so label
 * assertions (ribbon tabs, New Page, …) are deterministic regardless of the
 * machine locale.
 */
export async function launchMdt(): Promise<{ electronApp: ElectronApplication; page: Page }> {
  const electronApp = await electron.launch({
    args: [mainJs],
    cwd: appDir,
    env: { ...process.env, GENOFFICE_LANG: 'en' },
  })
  const page = await electronApp.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  await page.waitForSelector('#root *', { timeout: 60_000 })
  return { electronApp, page }
}

export async function closeWelcome(page: Page): Promise<void> {
  const dialog = page.getByRole('dialog', { name: /welcome to metis development tool/i })
  await expect(dialog).toBeVisible({ timeout: 30_000 })
  await dialog.getByRole('button', { name: 'Start designing' }).click()
  await expect(dialog).toBeHidden()
}

/**
 * Create a real MDT project directory (same @mdt/project store the main
 * process uses) under e2e/mdt/test-results — never committed.
 */
export function createProjectOnDisk(root: string, name: string): void {
  createProject(root, name)
}

/**
 * Register a project directory in the app's Recent Projects list WITHOUT any
 * dialog: open it once through the bridge, then close the session again so a
 * later open (the welcome screen's recent click) does not hit the project lock.
 */
export async function seedRecentProject(page: Page, root: string): Promise<void> {
  const opened = await getMdtApi(page).openPath(root)
  if (!opened?.ok) throw new Error(`openPath failed: ${opened?.error ?? 'unknown error'}`)
  await getMdtApi(page).close()
}

/**
 * Open a (recent-seeded) project through the welcome screen: Project dock tab
 * → Recent Projects → click the entry. This drives the real renderer path
 * (openPath IPC → zustand loadProject → deck sync).
 */
export async function openRecentProject(page: Page, name: string): Promise<void> {
  const dialog = page.getByRole('dialog', { name: /welcome to metis development tool/i })
  await page.getByRole('tab', { name: 'Project' }).click()
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name }).click()
  await expect(dialog).toBeHidden()
}

/** All five dock tabs render and can be walked without errors. */
export function dockTablist(page: Page) {
  return page.getByRole('tablist', { name: 'MDT tools' })
}

/**
 * Activate a dock tab. Clicking the already-selected tab TOGGLES the panel
 * off (MdtDock), so only click when it is not selected yet.
 */
export async function selectDockTab(page: Page, name: string): Promise<void> {
  const tab = dockTablist(page).getByRole('tab', { name })
  if ((await tab.getAttribute('aria-selected')) !== 'true') await tab.click()
  await expect(tab).toHaveAttribute('aria-selected', 'true')
}

/**
 * The MDT dock is a fixed 460px overlay on the right edge (top: 48px down),
 * which covers the right end of the ribbon body — including the Insert tab's
 * MDT Controls group. Activate overlaid ribbon buttons via keyboard instead
 * of a hit-tested click: focus + Enter dispatch the same onClick handler.
 */
export async function activateButton(page: Page, button: ReturnType<Page['getByRole']>) {
  await button.focus()
  await page.keyboard.press('Enter')
}

/**
 * axe scan scoped to a container (the page CSP blocks <script> injection and
 * @axe-core/playwright's builder needs a second page, so the axe source is
 * evaluated through the Playwright runtime bridge — same pattern as
 * mdt-smoke.spec.mts). Returns the serious/critical violations only.
 */
export async function axeSeriousViolations(
  page: Page,
  scopeSelector: string,
): Promise<{ id: string; impact: string | null; nodes: { html: string; target: string[] }[] }[]> {
  const axeSource = readFileSync(
    path.resolve(here, '../../node_modules/axe-core/axe.min.js'),
    'utf8',
  )
  await page.evaluate(axeSource)
  const results = (await page.evaluate(
    `window.axe.run(document.querySelector(${JSON.stringify(scopeSelector)}), { resultTypes: ['violations'] })`,
  )) as {
    violations: { id: string; impact: string | null; nodes: { html: string; target: string[] }[] }[]
  }
  return results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious')
}

export function ensureScreenshotsDir(): string {
  mkdirSync(screenshotsDir, { recursive: true })
  return screenshotsDir
}

/**
 * Gracefully close the app even when the deck has unsaved changes: the main
 * process close guard would otherwise block quit behind a native
 * Save/Don't Save/Cancel message box, which the Electron driver cannot drive.
 * The patch answers it with "Don't Save" — the on-disk MDT project under test
 * is never written through that path, so test artifacts stay intact.
 */
export async function closeAppDiscardingDeck(electronApp: ElectronApplication): Promise<void> {
  await electronApp.evaluate(({ dialog }) => {
    const d = dialog as unknown as Record<string, (...args: unknown[]) => unknown>
    d.showMessageBox = async () => ({ response: 1, checkboxChecked: false })
    d.showMessageBoxSync = () => 1
  })
  await electronApp.close()
}
