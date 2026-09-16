# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: interaction-canvas.spec.mts >> Interactions tab renders the React Flow canvas with the derived page node (P07)
- Location: e2e\mdt\interaction-canvas.spec.mts:50:1

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator:  locator('.react-flow').locator('strong').filter({ hasText: 'Page 1' })
Expected: visible
Received: hidden
Timeout:  5000ms

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for locator('.react-flow').locator('strong').filter({ hasText: 'Page 1' })
    14 × locator resolved to <strong>Page 1</strong>
       - unexpected value "hidden"

```

```yaml
- button "File"
- button "Save (Ctrl+S)" [disabled]
- button "Undo" [disabled]
- button "Redo" [disabled]
- text: AutoSave
- button "Home"
- button "Insert"
- button "Draw"
- button "Design"
- button "Transitions"
- button "Animations"
- button "Page Show"
- button "Review"
- button "View"
- button "Paste"
- button "Cut (Ctrl+X)" [disabled]
- button "Copy (Ctrl+C)" [disabled]
- button "Format Painter (select an element first; Ctrl+Shift+C copy format / Ctrl+Shift+V paste format)" [disabled]
- button "From Current Page"
- button "Pages"
- textbox [disabled]: Calibri
- button "Font (select a text box, shape, or table first)" [disabled]
- textbox [disabled]: "18"
- button "Font Size (pt)" [disabled]
- button "Increase Font Size" [disabled]
- button "Decrease Font Size" [disabled]
- button "Clear All Formatting" [disabled]
- button "Bold" [disabled]: B
- button "Italic" [disabled]: I
- button "Underline" [disabled]: U
- button "ab" [disabled]
- button "Superscript" [disabled]
- button "Subscript" [disabled]
- button "A" [disabled]
- button "Paragraph"
- button "Format Pane"
- button "Align" [disabled]
- button "Find/Replace"
- button "Collapse the Ribbon (Ctrl+F1)"
- text: "1"
- textbox "Click to add speaker notes (saved into the .pptx)"
- contentinfo:
  - text: Page 1 of 1
  - button "Notes"
  - button "Full-screen show from the current page (Shift+F5)"
  - button "−"
  - slider: "75"
  - button "+"
  - text: 73%
- tablist "MDT tools":
  - tab "Agents"
  - tab "Interactions" [selected]
  - tab "Semantics"
  - tab "Build"
  - tab "Project"
- button "▸ Lint"
- text: 0 errors 0 warnings
- textbox "Search nodes":
  - /placeholder: Search pages / agents…
- application:
  - img
  - button "Zoom In" [disabled]:
    - img
  - button "Zoom Out":
    - img
  - button "Fit View":
    - img
  - img "Mini Map"
  - link "React Flow attribution":
    - /url: https://reactflow.dev?utm_source=attribution
    - text: React Flow
```

# Test source

```ts
  1  | /**
  2  |  * MDT interaction canvas E2E (tasklist P07.24, P14.13): the @xyflow/react
  3  |  * graph editor inside the dock's Interactions tab, against the BUILT desktop
  4  |  * app. Build first:
  5  |  *   npm run build:mdt && npx playwright test --config e2e/mdt/playwright.config.ts
  6  |  *
  7  |  * The canvas only renders for an open project (pages derive from the deck),
  8  |  * so the spec creates a project on disk through @mdt/project and opens it
  9  |  * through the welcome screen's Recent Projects list — native dialogs cannot
  10 |  * be automated in the Electron driver.
  11 |  */
  12 | import { test, expect } from '@playwright/test'
  13 | import type { ElectronApplication, Page } from '@playwright/test'
  14 | import fs from 'node:fs'
  15 | import path from 'node:path'
  16 | 
  17 | import {
  18 |   here,
  19 |   launchMdt,
  20 |   requireBuiltApp,
  21 |   closeWelcome,
  22 |   createProjectOnDisk,
  23 |   seedRecentProject,
  24 |   openRecentProject,
  25 |   selectDockTab,
  26 | } from './helpers.mts'
  27 | 
  28 | const projectRoot = path.join(here, 'test-results', 'p07-24-canvas-project')
  29 | 
  30 | let electronApp: ElectronApplication
  31 | let page: Page
  32 | 
  33 | test.beforeAll(async () => {
  34 |   requireBuiltApp()
  35 |   const launched = await launchMdt()
  36 |   electronApp = launched.electronApp
  37 |   page = launched.page
  38 |   await closeWelcome(page)
  39 |   createProjectOnDisk(projectRoot, 'E2E Canvas Project')
  40 |   await seedRecentProject(page, projectRoot)
  41 |   await openRecentProject(page, 'E2E Canvas Project')
  42 |   await selectDockTab(page, 'Interactions')
  43 | })
  44 | 
  45 | test.afterAll(async () => {
  46 |   await electronApp.close()
  47 |   fs.rmSync(projectRoot, { recursive: true, force: true })
  48 | })
  49 | 
  50 | test('Interactions tab renders the React Flow canvas with the derived page node (P07)', async () => {
  51 |   const flow = page.locator('.react-flow')
  52 |   await expect(flow).toBeVisible({ timeout: 30_000 })
  53 |   // the blank deck's single slide derived into one page node — the visible
  54 |   // <strong> title row carries the derived page name
> 55 |   await expect(flow.locator('strong', { hasText: 'Page 1' })).toBeVisible()
     |                                                               ^ Error: expect(locator).toBeVisible() failed
  56 |   // … with its kind/element badge
  57 |   await expect(flow.getByText(/page · \d+ el/)).toBeVisible()
  58 | })
  59 | 
  60 | test('the MiniMap renders inside the canvas', async () => {
  61 |   await expect(page.locator('.react-flow__minimap')).toBeVisible()
  62 | })
  63 | 
  64 | test('the node search input is present and usable', async () => {
  65 |   const search = page.getByRole('textbox', { name: 'Search nodes' })
  66 |   await expect(search).toBeVisible()
  67 |   // searching for an existing page and pressing Enter centers the viewport —
  68 |   // the canvas must stay intact afterwards
  69 |   await search.fill('Page 1')
  70 |   await search.press('Enter')
  71 |   await expect(page.locator('.react-flow')).toBeVisible()
  72 |   await expect(page.locator('.react-flow__minimap')).toBeVisible()
  73 | })
  74 | 
  75 | test('the lint bar renders and expands to the issue list (P07.22)', async () => {
  76 |   const lintToggle = page.getByRole('button', { name: /Lint/ })
  77 |   await expect(lintToggle).toBeVisible()
  78 |   // a fresh project has no interactions, hence a clean graph
  79 |   await expect(page.getByText('0 errors')).toBeVisible()
  80 |   await expect(page.getByText('0 warnings')).toBeVisible()
  81 |   await lintToggle.click()
  82 |   await expect(page.getByText('No issues')).toBeVisible()
  83 |   await lintToggle.click()
  84 | })
  85 | 
```