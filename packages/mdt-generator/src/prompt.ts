/**
 * Builder prompt contract (P10.08): the deterministic instruction text the
 * MDT agent (Codex) receives when asked to extend a generated app. Pure
 * function of the blueprint + task — snapshot-tested.
 */
import { blueprintHash, type BuildBlueprint } from '@mdt/schema'
import type { CapabilityManifest } from '@mdt/capabilities'

import { GENERATOR_VERSION } from './generator.js'

export interface BuilderPromptOptions {
  /** path of the blueprint document inside the generated workspace */
  blueprintPath?: string
  manifests?: Map<string, CapabilityManifest>
}

export function builderPrompt(
  blueprint: BuildBlueprint,
  task: string,
  options: BuilderPromptOptions = {},
): string {
  const blueprintPath = options.blueprintPath ?? 'mdt.project.json'
  const hash = blueprintHash(blueprint)
  const capabilityLines =
    options.manifests === undefined || options.manifests.size === 0
      ? ['- (no capability manifests supplied)']
      : [...options.manifests.values()]
          .sort((a, b) => a.id.localeCompare(b.id))
          .map((manifest) => {
            const required = manifest.inputSchema.required ?? []
            return `- ${manifest.id} v${manifest.version}: required args [${required.join(', ')}] — ${manifest.description}`
          })
  const agentLines =
    blueprint.agents.length === 0
      ? ['- (no agents in this project)']
      : blueprint.agents.map(
          (agent) =>
            `- ${agent.name} (${agent.id}): provider=${agent.modelPolicy.provider} model=${agent.modelPolicy.model} api=${agent.modelPolicy.api} capabilities=[${agent.capabilityRefs.join(', ')}]`,
        )
  const pageLines =
    blueprint.pages.length === 0
      ? ['- (no pages in this project)']
      : blueprint.pages.map(
          (page) =>
            `- ${page.name} (${page.id}) type=${page.type} ${page.viewport.width}x${page.viewport.height}`,
        )

  return `# MDT Builder Task

## Task

${task}

## Inputs

- Blueprint: \`${blueprintPath}\` (BuildBlueprint v${blueprint.blueprintVersion}, schema v${blueprint.schemaVersion})
- Project: ${blueprint.project.name} (${blueprint.project.id})
- Blueprint hash (sha256, canonical JSON): \`${hash}\`
- Generator: @mdt/generator v${GENERATOR_VERSION}, target=web-agent

### Pages
${pageLines.join('\n')}

### Agents (Pi)
${agentLines.join('\n')}

### Capability SDK (registry manifests)
${capabilityLines.join('\n')}

## Architecture constraints (ADR-0006)

- The app is a standalone Vite + React + TypeScript SPA plus a Node + Express
  agent service. It must run with \`npm install && npm run dev\` and no MDT
  runtime involvement.
- Every MDT page renders from the blueprint: type=page → route,
  modal/drawer/popover → overlay components on their host page. Elements keep
  absolute-position layout from the design geometry and carry
  \`data-mdt-id\` attributes (mapping lives in \`.mdt-map.json\`).
- Interactions compile to handlers: navigate / openModal / openDrawer /
  close / back / toggleVisibility / submit / sendToAgent / invokeCapability
  (POST /api/capability/:instanceId) / setVariable / bindOutput.
- Variables persist by scope: project/session → localStorage,
  page → in-memory.

## Pi constraints (ADR-0004, docs/upstream/PI_BASELINE.md)

- The ONLY allowed agent runtime is \`@earendil-works/pi-agent-core\` at the
  pinned version, with \`streamSimple\` from \`@earendil-works/pi-ai/compat\`
  as the mandatory \`streamFn\`. Do not import the deprecated
  \`@mariozechner/*\` scope. Do not reimplement the agent loop.
- \`server/agents.config.json\` is the source of truth for agents (model
  policy incl. compat flags, instructions, tool refs). Custom providers get
  no env-var fallback inside Pi — keys come from this app's env via
  \`getApiKey\` (MDT_PROVIDER_API_KEY_*).
- Tools THROW on failure; never return error text as tool content. Events
  shown to the UI are the normalized RuntimeEvent union — never raw Pi
  events.

## Capability SDK rules

- Capability modules in \`server/capabilities/\` are self-contained plain JS
  (manifest + \`execute(input, ctx)\`), generated and owned by the generator.
  Keep their security guards intact: SSRF url guard, permission gates
  (\`ctx.granted\`), secret redaction in logs, size caps, honoring
  \`ctx.signal\`.

## Acceptance commands

All must pass before you report done:

\`\`\`bash
npm install
npm run typecheck
npm run test:unit
npm run test:e2e     # SSE is mocked via Playwright routes — no real LLM
npm run build
\`\`\`

## Forbidden actions

- Do NOT run \`git commit\`, \`git push\`, or modify files outside this app.
- Do NOT add npm dependencies beyond the template's set; never add
  \`@openai/codex\`, \`@mdt/*\`, or AI provider SDKs.
- Do NOT remove \`data-mdt-id\` attributes, .mdt-map.json, or
  .mdt/generator-manifest.json (the patch boundary: regenerating restores
  generator-owned files listed there).
- Do NOT hardcode API keys, endpoints, or telemetry in source files.
- Do NOT change the blueprint ids; they are stable identities used by the
  designer, the map, and tests.
`
}
