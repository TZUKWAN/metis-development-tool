# GenOffice AI Dependency Audit & Removal Plan (baseline `e064f3a`)

> Audit performed 2026-09-15 for MDT task P02.09. Line numbers verified
> against the working tree.

The three AI packages — `@genoffice/agent-core`, `@genoffice/ai-provider`,
`@genoffice/ai-search` — power GenOffice's built-in AI panel, GenSpark
account/cloud features. MDT replaces that panel with its own
Agent/Capability/Codex model, so these packages and their UI must be
removed **without touching canvas fundamentals**.

## 1. Usage by `apps/slides`

### `@genoffice/agent-core` — renderer ONLY (+ one type re-export)

| File                                          | Line | Symbols                                                                                                  | Feature                               |
| --------------------------------------------- | ---- | -------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| `apps/slides/src/renderer/ai/AiPanel.tsx`     | 2-8  | `AgentLoop`, `composeSkills`, `IPC_STREAM_SILENCE_TIMEOUT_MS`, `AgentImage` (type), `ToolDisplay` (type) | AI panel chat/agent loop              |
| `apps/slides/src/renderer/ai/transport.ts`    | 1    | `createIpcTransport`, `AgentTransport`                                                                   | wires AgentLoop to `window.slidesApi` |
| `apps/slides/src/renderer/ai/slides-skill.ts` | 1    | `AgentSkill`, `ToolDisplay` (types)                                                                      | deck-editing skill                    |
| `apps/slides/src/renderer/ai/files-skill.ts`  | 1    | `AgentSkill` (type)                                                                                      | chat attachment skill                 |
| `apps/slides/src/renderer/ai/slide-qc.ts`     | 5-12 | `AgentLoop`, `AgentImage`, `AgentSkill`, `AgentTransport`                                                | per-page post-generation QC loops     |
| `apps/slides/src/shared/ipc.ts`               | 54   | `AgentToolCall`, `AgentToolDef` (type-only re-export)                                                    | IPC contract types                    |

### `@genoffice/ai-provider` — MAIN + renderer + shared types

| File                                      | Line         | Symbols                                                                                            | Feature                                                                                      |
| ----------------------------------------- | ------------ | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `apps/slides/src/main/ai-ipc.ts`          | 19-36        | settings persistence + streaming proxy (`streamForProvider`, `resolveAiSettings`, …)               | `ai:*` channel family                                                                        |
| `apps/slides/src/main/ai-ipc.ts`          | 37           | `shutdownCodexAppServers` from `/codex-app-server`                                                 | codex CLI app-server lifecycle (spawn at `packages/ai-provider/src/codex-app-server.ts:283`) |
| `apps/slides/src/renderer/ai/AiPanel.tsx` | 10           | `imageGenerationAvailable`, `mediaAnalysisAvailable`                                               | feature gating                                                                               |
| `apps/slides/src/renderer/ai/slide-qc.ts` | 14-17        | `getProviderAdapter`, `modelLacksVision`, `AiSettings`                                             | QC model selection                                                                           |
| `apps/slides/src/shared/ipc.ts`           | 14-19, 43-53 | types; line 53 **value re-export** `export { AI_PROVIDERS } from '@genoffice/ai-provider/browser'` | IPC contract                                                                                 |

### `@genoffice/ai-search` — MAIN ONLY

| File                                  | Line  | Symbols                                                                                                                                        | Feature                                                       |
| ------------------------------------- | ----- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `apps/slides/src/main/ai-ipc.ts`      | 39-48 | `webSearchTool`, `imageSearchTool`, `ensureGenofficeLogin`, `gskApiKey`, `generateImageTool`, `analyzeMediaTool`, `gskLoginInfo`, `hasGskAuth` | search/image-gen/media tools + gsk auth                       |
| `apps/slides/src/main/slides-main.ts` | 30    | `gskApiKey`, `gskSlideGenerate`, `setGskProxyUrl`                                                                                              | cloud single-page generation (handlers 1588-1694; proxy 4613) |

### Main/preload/renderer dependency summary

- **MAIN: YES** — `ai-provider` and `ai-search` are hard runtime deps of the
  slides main process (`ai-ipc.ts:19-48`, `slides-main.ts:30`).
- **PRELOAD: NO (runtime)** — only `electron` + `electron-utils/drop-open`
  are value imports (`preload/index.ts:2,6`); AI symbols are `import type`.
- **Renderer: YES for agent-core + ai-provider/browser** — bundled into the
  AI panel feature only (`renderer/ai/*`); canvas/ribbon/tables/presenter
  have zero AI imports.

## 2. Designer-critical packages (confirmed keep)

| Package                                          | Slides main                                                                                                                                               | Slides preload              | Slides renderer                                                                       | Evidence                                                                 |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `@genoffice/project-store`                       | YES — chat persistence (`slides-main.ts:61`, 4274-4351, `new ProjectStore(app.getPath('userData'))` 4278)                                                 | type only                   | via `window.projectApi`                                                               | designer-relevant (chat history); shell also uses it (shell index.ts:96) |
| `@genoffice/file-parse`                          | YES — `attachments-ipc.ts:12`                                                                                                                             | no                          | no                                                                                    | AI-attachment feature                                                    |
| `@genoffice/i18n`                                | YES — `main/i18n-main.ts:2`, `slides-main.ts:59`                                                                                                          | no                          | YES — `renderer/i18n/*`                                                               | **critical** (all UI copy)                                               |
| `@genoffice/ui`                                  | YES — `main/fonts.ts`                                                                                                                                     | type only                   | YES — 10+ files (`App.tsx`, `main.tsx`, ribbon, FormatPane, galleries, styles.css, …) | **critical** (design system)                                             |
| `@genoffice/electron-utils`                      | YES — `slides-main.ts:32-59` (protocol, nav guard, dialogs, `fetchRemoteImage`, headless), `ai-ipc.ts:38`, `attachments-ipc.ts:11`, `presenter-show.ts:9` | YES (runtime) — `drop-open` | YES — `headless-export.ts`                                                            | **critical** plumbing                                                    |
| pptx-engine / pptx-ops / pptx-render / pipelines | YES — core editor                                                                                                                                         | types only                  | `RenderSlide` types                                                                   | **critical, untouchable**                                                |

## 3. Shell usage of the AI packages

### `@genoffice/ai-search` (shell MAIN)

- `apps/shell/src/main/index.ts:96-102` — `genofficeLogout`, `gskLoginInfo`,
  `loadGenofficeAuth`, `setGskProxyUrl`, `startGenofficeLogin` → account UI
  (`home:account-status` 2932, `home:account-login` 2944-2968, logout 2973);
  gsk proxy bootstrap feeds slides (`slides-main.ts:4613` via
  `configureSlidesRuntime`, shell index.ts:319).
- `apps/shell/src/main/cloud-projects.ts:3` — `home:cloud-projects*`
  (shell index.ts:3329-3339).

### `@genoffice/ai-provider` (shell PRELOAD + renderer + shared)

- `apps/shell/src/preload/index.ts:3-9` **runtime import** —
  `AI_PROVIDERS`, `AI_MEDIA_PROVIDERS`, `AI_SEARCH_PROVIDERS`,
  `getProviderAdapter`; the shell preload bundle **fails to build** without it.
- `apps/shell/src/shared/home-api.ts:3-12` types;
  `renderer/src/SettingsModal.tsx:17,25` AI providers pane;
  `renderer/src/provider-logos.tsx:3`.

### `@genoffice/agent-core` — NOT used by shell

Zero imports under `apps/shell/src`. `apps/shell/src/main/agent-skills.ts`
is independent (node builtins + JSZip + `@genoffice/cli/install`).

### Hidden coupling

`registerAiIpc()` from `apps/docs/src/main/docs-main.ts` runs inside the
shell process (`apps/shell/src/main/index.ts:4322`) and owns `ai:chat`
(docs-main.ts:2985), `ai:codex-models` (2823), `ai:search-test` (2964),
`ai:media-test` (2973). Slides relies on this in shell mode and registers
its own copies only in standalone mode (`ai-ipc.ts:251-254`).

### Headless export — NOT AI-dependent

`apps/shell/src/main/headless-export.ts:11-23` imports only node builtins +
`electron-utils`; slides exporter injected at shell index.ts:4352.

## 4. Removal plan (ordered, minimizes breakage)

| Step | Action                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Packages unlocked for deletion                       |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| 1    | Delete slides `renderer/ai/*` (AiPanel, transport, slides-skill, files-skill, slide-qc, edit-queue, EditQueueCard, layout-script*, outline-json, prompts), `components/AiAskPopover.tsx`; strip App.tsx wiring (imports 80-84, state 351/361/426-430, ActionCtx `openAskPopover`, ⌘K branch keyboard-actions.ts:75-80, AiPanel mount, `undo-routing.ts` AI attributes); drop `shared/ipc.ts:54` agent-core re-export                                                                          | `@genoffice/agent-core`                              |
| 2    | Delete slides `main/ai-ipc.ts` + its registration; delete cloud/local page-generation handlers (`slides:cloud-gen-status`, `slides:cloud-page-generate`, `slides:local-page-generate`, `slides:land-generated-pages`) and `slides:ai-snapshot-restore`; strip `slides-main.ts:30` gsk import + proxy setup 4613 + kill switch 1586; strip `shared/ipc.ts:14-19,43-53` ai-provider types + `AI_PROVIDERS` re-export; strip preload `aiStream`/`onAiStream`/settings surfaces (preload:367-415) | `@genoffice/ai-search` (slides side)                 |
| 3    | Since MDT drops the shell entirely (standalone app only): no shell refactor needed — remove `apps/shell` workspace. If shell were kept: rewrite preload (drop provider imports), stub account/cloud handlers, remove `registerAiIpc()` call                                                                                                                                                                                                                                                   | `@genoffice/ai-provider`                             |
| 4    | Delete `attachments-ipc.ts` + `window.desktop` bridge + `files-skill` consumers (AI-attachment feature)                                                                                                                                                                                                                                                                                                                                                                                       | `@genoffice/file-parse` (+ transitive `docx-engine`) |
| 5    | Remove devDeps from app package.json; verify no dangling imports                                                                                                                                                                                                                                                                                                                                                                                                                              | —                                                    |

`project-store`, `i18n`, `ui`, `electron-utils`, pptx-engine, pptx-ops,
pptx-render, pipelines are **retained** (see §2).

**Security side-benefit:** removing the AI family eliminates every HIGH
network/credential channel in the slides inventory (`ai:*` family,
`slides:cloud-page-generate`) and the codex CLI spawn path
(`codex-app-server.ts:283`), leaving only font CDN download
(`font-store.ts:84`) as slides main-process egress. MDT's replacement
surface (`mdt-codex`) re-introduces a codex spawn but under MDT's own
validated, sandboxed IPC contract (ADR-0005, P13).
