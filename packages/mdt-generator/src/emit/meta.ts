/**
 * Meta-file codegen (P11.13–P11.17): generated e2e specs, .env.example,
 * README.md. The patch manifest (.mdt/generator-manifest.json) and source
 * map (.mdt-map.json) are assembled in generator.ts (they need the final
 * file contents + hashes).
 */
import type { BuildBlueprint } from '@mdt/schema'

import type { FrontendPlan } from './pages.js'

export interface BlueprintInteractionView {
  navigate: {
    sourcePath: string
    sourceElementId: string
    targetPath: string
    targetName: string
  }[]
  chat: {
    pagePath: string
    chatElementId: string
    agentId: string
  } | null
}

/** Deterministic view of interactions used by the generated e2e specs. */
export function interactionView(
  blueprint: BuildBlueprint,
  plan: FrontendPlan,
): BlueprintInteractionView {
  const routeByPage = new Map(plan.pages.map((page) => [page.page.id, page.routePath]))
  const nameByPage = new Map(plan.pages.map((page) => [page.page.id, page.page.name]))
  const navigate: BlueprintInteractionView['navigate'] = []
  let chat: BlueprintInteractionView['chat'] = null
  for (const interaction of blueprint.interactions) {
    if (!interaction.enabled) continue
    const action = interaction.action
    if (action.type === 'navigate') {
      const sourcePath = routeByPage.get(interaction.sourcePageId)
      const targetPath = routeByPage.get(action.targetPageId)
      if (sourcePath !== undefined && targetPath !== undefined && interaction.sourceElementId) {
        navigate.push({
          sourcePath,
          sourceElementId: interaction.sourceElementId,
          targetPath,
          targetName: nameByPage.get(action.targetPageId) ?? action.targetPageId,
        })
      }
    }
    if (
      action.type === 'sendToAgent' &&
      action.chatElementId !== undefined &&
      chat === null &&
      interaction.sourceElementId !== undefined
    ) {
      const pagePath = routeByPage.get(interaction.sourcePageId)
      if (pagePath !== undefined) {
        chat = { pagePath, chatElementId: action.chatElementId, agentId: action.agentId }
      }
    }
  }
  return { navigate, chat }
}

export function emitSmokeSpec(_pages: FrontendPlan['pages']): string {
  return `/**
 * Generated route smoke test (generator-owned): every MDT page route renders
 * its page container. No agent service needed — pure frontend rendering.
 */
import { expect, test } from '@playwright/test'

import { pageRoutes } from '../../src/routes'

test.describe('route smoke', () => {
  for (const route of pageRoutes) {
    test(\`page \${route.path} renders\`, async ({ page }) => {
      await page.goto(route.path)
      await expect(page.locator('.mdt-page').first()).toBeVisible()
      const pageId = await page.locator('.mdt-page').first().getAttribute('data-mdt-id')
      expect(pageId).toBe(route.pageId)
    })
  }
})
`
}

export function emitNavigationSpec(view: BlueprintInteractionView): string | null {
  const first = view.navigate[0]
  if (first === undefined) return null
  return `/**
 * Generated navigation interaction test (generator-owned): clicking the
 * navigate interaction's source element lands on the target page.
 */
import { expect, test } from '@playwright/test'

test('navigate interaction: click moves to the target page', async ({ page }) => {
  await page.goto(${JSON.stringify(first.sourcePath)})
  await page.locator('[data-mdt-id="${first.sourceElementId}"]').click()
  await expect(page.locator('.mdt-page').first()).toBeVisible()
  await expect(page).toHaveURL(new RegExp(${JSON.stringify(`${first.targetPath.replace(/\/$/, '')}$`)}))
})
`
}

export function emitChatSpec(view: BlueprintInteractionView): string | null {
  const chat = view.chat
  if (chat === null) return null
  return `/**
 * Generated chat interaction test (generator-owned): the SSE endpoint is
 * mocked via Playwright route interception — no agent service, no LLM.
 */
import { expect, test } from '@playwright/test'

test('chat send streams the mocked agent response', async ({ page }) => {
  await page.route('**/api/agent/**', async (route) => {
    if (route.request().url().includes('/cancel')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' })
      return
    }
    const events = [
      { type: 'run_start', runId: 'run-test' },
      { type: 'text_delta', delta: 'Mocked ' },
      { type: 'text_delta', delta: 'answer' },
      { type: 'run_end', stopReason: 'completed', responseText: 'Mocked answer' },
    ]
    const body = events.map((event) => \`data: \${JSON.stringify(event)}\\n\\n\`).join('')
    await route.fulfill({ status: 200, contentType: 'text/event-stream', body })
  })
  await page.goto(${JSON.stringify(chat.pagePath)})
  const chatBox = page.locator('[data-mdt-id="${chat.chatElementId}"]')
  await chatBox.locator('input[type="text"]').fill('Hello agent')
  await chatBox.getByRole('button', { name: 'Send' }).click()
  await expect(chatBox.locator('.mdt-chat-assistant').filter({ hasText: 'Mocked answer' })).toBeVisible()
})
`
}

export function emitEnvExample(blueprint: BuildBlueprint): string {
  const providers = [...new Set(blueprint.agents.map((agent) => agent.modelPolicy.provider))].sort()
  const secretSlots = [
    ...new Set(blueprint.capabilities.flatMap((instance) => Object.keys(instance.secrets))),
  ].sort()
  const lines: string[] = [
    '# MDT generated app — API key configuration (variable NAMES only; fill values locally).',
    "# One variable per provider used by the project's agents",
    '# (provider uppercased, non-alphanumeric characters → "_").',
  ]
  for (const provider of providers) {
    lines.push(`MDT_PROVIDER_API_KEY_${provider.replace(/[^A-Za-z0-9]/g, '_').toUpperCase()}=`)
  }
  lines.push('')
  lines.push('# Fallback key for any provider without a specific variable above.')
  lines.push('MDT_LLM_API_KEY=')
  lines.push('')
  lines.push("# Optional endpoint overrides applied to every agent's model policy.")
  lines.push('MDT_LLM_BASE_URL=')
  lines.push('MDT_LLM_MODEL=')
  if (secretSlots.length > 0) {
    lines.push('')
    lines.push('# Capability secret slots referenced by this project (${secret:NAME} refs).')
    for (const slot of secretSlots) {
      lines.push(`MDT_SECRET_${slot.replace(/[^A-Za-z0-9]/g, '_').toUpperCase()}=`)
    }
  }
  lines.push('')
  lines.push('# Agent service port (default 8790; Vite proxies /api to it).')
  lines.push('MDT_PORT=8790')
  return `${lines.join('\n')}\n`
}

export function emitReadme(options: {
  blueprint: BuildBlueprint
  routeTable: { path: string; pageName: string }[]
  agents: { name: string; model: string; provider: string; capabilities: string[] }[]
  warnings: string[]
  generatorVersion: string
}): string {
  const { blueprint, routeTable, agents } = options
  const routeRows = routeTable
    .map((route) => `| \`${route.path}\` | ${route.pageName} |`)
    .join('\n')
  const agentRows = agents
    .map(
      (agent) =>
        `| ${agent.name} | \`${agent.model}\` via \`${agent.provider}\` | ${agent.capabilities.join(', ') || '—'} |`,
    )
    .join('\n')
  const warnings =
    options.warnings.length > 0
      ? `\n## Generation warnings\n\n${options.warnings.map((warning) => `- ${warning}`).join('\n')}\n`
      : ''
  return `# ${blueprint.project.name}

Standalone web + agent app generated by \`@mdt/generator\` v${options.generatorVersion}
from an MDT BuildBlueprint (${blueprint.project.id}). Plain files, no MDT runtime
dependency: \`npm install && npm run dev\` and it works.

## Run

\`\`\`bash
npm install
cp .env.example .env      # fill in API keys / endpoint overrides
npm run dev               # agent service :8790 + Vite dev server :5174 (proxies /api)
\`\`\`

Open http://localhost:5174.

## Test

\`\`\`bash
npm run test:unit         # vitest (jsdom): variables, bindings, agent service (mocked)
npm run test:e2e          # playwright: route smoke, navigation, chat with mocked SSE
npm run build             # vite production build
npm run typecheck         # tsc --noEmit (strict)
\`\`\`

E2E tests never call a real LLM: the SSE endpoint is mocked via Playwright
route interception.

## Routes

| Path | MDT page |
| ---- | -------- |
${routeRows}

## Agents (Pi Agent Core)

| Agent | Model | Capability tools |
| ----- | ----- | ---------------- |
${agentRows}

## Architecture

- **Frontend** — Vite + React + TypeScript SPA (\`src/\`). One route per MDT
  page; modals/drawers/popovers are overlay components rendered by their host
  page. Elements are semantic HTML positioned absolutely per the design
  geometry, each carrying a \`data-mdt-id\` attribute for design↔source
  mapping (see \`.mdt-map.json\`).
- **Agent service** — Node + Express, plain ESM JavaScript, zero build step
  (\`server/\`). Wraps \`@earendil-works/pi-agent-core\` (the Pi runtime):
  \`server/pi-runtime.js\` maps the blueprint's model policy onto a pi-ai
  \`Model\` (including endpoint-compat flags), passes \`streamSimple\` from
  \`@earendil-works/pi-ai/compat\` as the mandatory \`streamFn\`, and converts
  Pi's raw events into the normalized \`RuntimeEvent\` union streamed to the
  UI over SSE. Tools THROW on failure — Pi turns throws into structured tool
  errors the model can react to.
- **Capabilities** — \`server/capabilities/*.js\` are self-contained modules
  (manifest + \`execute(input, ctx)\`) inlined by the generator, including
  their security guards (SSRF url guard, permission gates, secret redaction).
  The app has **no \`@mdt/*\` dependency** by construction.
- **Contract** — \`src/shared/protocol.ts\` mirrors the RuntimeEvent union;
  the UI never touches Pi's raw event types.

## Configuration

See \`.env.example\`: \`MDT_PROVIDER_API_KEY_<PROVIDER>\` (Pi custom providers
have no env fallback, so the service wires \`getApiKey\` from this app's own
environment), \`MDT_LLM_BASE_URL\`/\`MDT_LLM_MODEL\` overrides, and
\`MDT_SECRET_<NAME>\` capability secret slots.

## Regeneration

This app was emitted from an MDT blueprint. Files listed in
\`.mdt/generator-manifest.json\` are generator-owned: regenerating the project
restores them (local edits are recorded as conflicts). Everything else is
yours to edit freely.
${warnings}
`
}
