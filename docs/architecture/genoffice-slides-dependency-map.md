# GenOffice Slides Dependency Map (baseline `e064f3a`)

> Audit performed 2026-09-15 for MDT task P02.06. Evidence-verified against the
> working tree; commands used are listed in the appendix.

## 1. Direct `@genoffice/*` deps of `apps/slides`

Source: `apps/slides/package.json`

| Package                     | Declared as              |
| --------------------------- | ------------------------ |
| `@genoffice/agent-core`     | devDependency            |
| `@genoffice/ai-provider`    | devDependency            |
| `@genoffice/ai-search`      | devDependency            |
| `@genoffice/file-parse`     | devDependency            |
| `@genoffice/i18n`           | devDependency            |
| `@genoffice/pptx-engine`    | devDependency            |
| `@genoffice/pptx-ops`       | devDependency            |
| `@genoffice/pptx-render`    | devDependency            |
| `@genoffice/project-store`  | devDependency            |
| `@genoffice/ui`             | devDependency            |
| `@genoffice/electron-utils` | **dependency** (runtime) |

Note: `@genoffice/pipelines` is **NOT declared** but **IS imported** via deep
subpath imports (see §3). All 10 renderer-imported packages are declared;
`pipelines` is the one undeclared dependency. The app ships bundled via
electron-vite, so dev-vs-runtime rarely matters in practice.

## 2. Transitive closure (workspace packages)

Edges (all declared under `dependencies` of the respective packages):

- `ai-provider` → `agent-core`
- `ai-search` → `ai-provider`, `electron-utils`
- `file-parse` → `docx-engine`
- `docx-engine` → `pptx-engine`
- `pptx-ops` → `pptx-engine`
- `pptx-render` → `pptx-engine`
- `ui` → `i18n`, `pptx-render`
- `pipelines` → `pptx-engine`, `pptx-render`
- leaves (no `@genoffice` deps): `agent-core`, `electron-utils`, `i18n`,
  `project-store`, `pptx-engine`

**Slides closure (13 packages):** agent-core, ai-provider, ai-search,
docx-engine, electron-utils, file-parse, i18n, pipelines, pptx-engine,
pptx-ops, pptx-render, project-store, ui.

**NOT in closure (5 of 18 total):** `cli`, `font-metrics`, `html2docx`,
`pdf2docx`, `xlsx-gateway`.

## 3. Undeclared imports found in `apps/slides`

- `@genoffice/pipelines/slides` — `apps/slides/src/main/slides-main.ts:58`
  (`buildPagePptx, parsePageSpec`), `apps/slides/src/main/ai-ipc.ts:51`
  (`coverCropFractions`); subpath `@genoffice/pipelines/slides/layout-audit`
  — `apps/slides/tests/layout-tools.test.ts:10`; path aliases in
  `apps/slides/electron.vite.config.ts:31-35` and
  `apps/slides/vitest.config.ts:37-41`.
  **Fix for MDT: add `@genoffice/pipelines` to the app's package.json**
  (drags in nothing new — only pptx-engine + pptx-render).
- `@genoffice/i18n` IS declared and used (main:
  `apps/slides/src/main/slides-main.ts:60`; renderer:
  `apps/slides/src/renderer/i18n/locale.tsx:3`,
  `components/ContextMenu.tsx:6`).
- No other undeclared imports. Three cross-package mentions are comments
  only: `packages/ai-provider/src/media-protocols.ts:9`,
  `packages/docx-engine/src/generate.ts:3240`,
  `apps/shell/src/main/pdf2docx-local.ts:4`.

## 4. Verdict table

| Package        | Direct dep of slides? | Consumed by (transitive path)                                                                                                  | Evidence (file:line)                                                                      | Verdict                                                          |
| -------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| pptx-render    | yes (dev)             | slides; ui; pipelines                                                                                                          | `apps/slides/src/renderer/App.tsx:2` (RenderSlide types), `packages/ui/package.json` deps | **KEEP for MDT**                                                 |
| ui             | yes (dev)             | slides                                                                                                                         | `apps/slides/src/renderer/main.tsx:8-17` (CSS + `installScreenTips`), `App.tsx:88`        | **KEEP**                                                         |
| pptx-engine    | yes (dev)             | slides; docx-engine, file-parse→docx-engine, pptx-ops, pptx-render, ui→pptx-render, pipelines                                  | `apps/slides/src/main/ai-ipc.ts:49`, `apps/slides/src/main/font-store.ts:14`              | **KEEP**                                                         |
| agent-core     | yes (dev)             | slides; ai-provider                                                                                                            | `apps/slides/src/renderer/ai/transport.ts:1`, `ai/files-skill.ts:1`                       | KEEP while GenOffice AI panel exists; **removable after P03.05** |
| electron-utils | yes (dep)             | slides; ai-search                                                                                                              | `apps/slides/src/main/slides-main.ts:47`, `presenter-show.ts:9`                           | **KEEP**                                                         |
| project-store  | yes (dev)             | slides                                                                                                                         | `apps/slides/src/main/slides-main.ts:61` (`ProjectStore`), `preload/index.ts:5`           | **KEEP** (chat persistence; MDT may repurpose)                   |
| ai-provider    | yes (dev)             | slides; ai-search                                                                                                              | `apps/slides/src/main/ai-ipc.ts:36`, `shared/ipc.ts:18`                                   | KEEP while AI panel exists; **removable after P03.05**           |
| pptx-ops       | yes (dev)             | slides                                                                                                                         | `apps/slides/src/main/slides-main.ts:56`, `shared/ipc.ts:28`                              | **KEEP**                                                         |
| ai-search      | yes (dev)             | slides                                                                                                                         | `apps/slides/src/main/slides-main.ts:30` (cloud deck gen), `ai-ipc.ts:48`                 | KEEP while AI/cloud-gen exists; **removable after P03.05**       |
| file-parse     | yes (dev)             | slides                                                                                                                         | `apps/slides/src/main/attachments-ipc.ts:12`                                              | AI-attachment feature; removable with AI panel                   |
| docx-engine    | no                    | file-parse (dep)                                                                                                               | `packages/file-parse/package.json`                                                        | KEEP (pulled by file-parse; removable with it)                   |
| i18n           | yes (dev)             | slides; ui                                                                                                                     | `slides-main.ts:60`, `renderer/i18n/locale.tsx:3`                                         | **KEEP**                                                         |
| pipelines      | **no (undeclared!)**  | slides (deep import); cli; shell                                                                                               | `slides-main.ts:58`, `electron.vite.config.ts:31-35`                                      | **KEEP + declare it**                                            |
| cli            | no                    | shell only                                                                                                                     | `apps/shell/package.json`, `apps/shell/src/main/cli-link.ts`                              | **candidate for removal**                                        |
| font-metrics   | no                    | docs app, pdf app, pdf2docx                                                                                                    | `apps/docs/src/main/docs-main.ts:59`, `apps/pdf/src/main/font-locate.ts`                  | **candidate for removal**                                        |
| html2docx      | no                    | nothing (dead today)                                                                                                           | only `packages/html2docx/package.json`                                                    | **candidate for removal**                                        |
| pdf2docx       | no                    | cli (dep); shell (relative source import `../../../../packages/pdf2docx/src` in `apps/shell/src/main/pdf2docx-local.ts:11-12`) | same                                                                                      | **candidate for removal**                                        |
| xlsx-gateway   | no                    | cli, sheets, shell                                                                                                             | `apps/sheets/src/renderer/*`, `apps/shell/package.json`                                   | **candidate for removal**                                        |

## 5. Per-app exclusive packages (unreferenced by slides closure)

| App           | Non-closure packages it uses                                            | Shared with                                                 |
| ------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------- |
| apps/docs     | `font-metrics`                                                          | pdf app, pdf2docx                                           |
| apps/pdf      | `font-metrics`                                                          | docs app, pdf2docx                                          |
| apps/sheets   | `xlsx-gateway`                                                          | cli, shell                                                  |
| apps/markdown | none — all deps inside slides closure                                   | —                                                           |
| apps/html     | none — same as markdown                                                 | —                                                           |
| apps/shell    | `cli`, `xlsx-gateway` (+ undeclared relative import of pdf2docx source) | xlsx-gateway shared with sheets/cli; cli exclusive to shell |

Net: if MDT keeps only the slides-derived app, deletable packages are
**cli, font-metrics, html2docx, pdf2docx, xlsx-gateway**. Removing the other
six apps does not touch any of the 13 KEEP packages.

## Appendix: evidence commands

```sh
cat apps/slides/package.json
grep -A30 '"dependencies"' packages/<pkg>/package.json
grep -rhoE "from '@genoffice/[a-z-]+'|import\('@genoffice/" apps/slides/src --include=*.ts --include=*.tsx
grep -rn "@genoffice/font-metrics\|html2docx\|pdf2docx\|pipelines\|xlsx-gateway\|cli" apps packages ee tools e2e
for a in docs sheets pdf markdown html shell; do grep '@genoffice/' apps/$a/package.json; done
```
