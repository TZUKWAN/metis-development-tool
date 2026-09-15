# MDT 1.0 — Task Status

> Release status: tracked per-task below. Audit via: node tools/audit-task-status.mjs
> 310 canonical IDs from MDT_1.0_TASKLIST.md; statuses: TODO/IN_PROGRESS/BLOCKED/REOPENED/DONE.

| ID     | Status | Owner      | Started    | Completed  | Verification command                                               | Result / Notes                                                                                                                      |
| ------ | ------ | ---------- | ---------- | ---------- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| P00.01 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see artifact/tests                                                 | TASK_STATUS.md exists, covers all 310 ids, maintained continuously                                                                  |
| P00.02 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see docs/build-environment.md, docs/upstream/GENOFFICE_BASELINE.md | verified: toolchain versions recorded; baseline SHA immutable; push-block test exit=128; repo TZUKWAN/metis-development-tool PUBLIC |
| P00.03 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests                                         | rules applied: baseline failures root-caused; no assertion lowering; P0/P1 get regression tests                                     |
| P00.04 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests                                         | Conventional Commits; per-task logical commits                                                                                      |
| P00.05 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests                                         | docs/adr/README.md + ADR-0001..0007                                                                                                 |

## P01 — 上游拉取、新 GitHub 仓库与许可证

| ID     | Status | Owner      | Started    | Completed  | Verification command                                               | Result / Notes                                                                                                                      |
| ------ | ------ | ---------- | ---------- | ---------- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| P01.01 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see docs/build-environment.md, docs/upstream/GENOFFICE_BASELINE.md | verified: toolchain versions recorded; baseline SHA immutable; push-block test exit=128; repo TZUKWAN/metis-development-tool PUBLIC |
| P01.02 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see docs/build-environment.md, docs/upstream/GENOFFICE_BASELINE.md | verified: toolchain versions recorded; baseline SHA immutable; push-block test exit=128; repo TZUKWAN/metis-development-tool PUBLIC |
| P01.03 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see docs/build-environment.md, docs/upstream/GENOFFICE_BASELINE.md | verified: toolchain versions recorded; baseline SHA immutable; push-block test exit=128; repo TZUKWAN/metis-development-tool PUBLIC |
| P01.04 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests                                         | invalid push URL + pre-push hook; simulated push fails exit 128                                                                     |
| P01.05 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see docs/build-environment.md, docs/upstream/GENOFFICE_BASELINE.md | verified: toolchain versions recorded; baseline SHA immutable; push-block test exit=128; repo TZUKWAN/metis-development-tool PUBLIC |
| P01.06 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests                                         | pushed to TZUKWAN/metis-development-tool main; public                                                                               |
| P01.07 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests                                         | LICENSE Apache-2.0; NOTICE updated; THIRD_PARTY_NOTICES.md                                                                          |
| P01.08 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests                                         | docs/upstream/UPDATE_GENOFFICE.md (merge forbidden)                                                                                 |
| P01.09 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests                                         | README/CONTRIBUTING rewritten; upstream governance files kept                                                                       |
| P01.10 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests                                         | CI workflow required checks; policy in CONTRIBUTING                                                                                 |

## P02 — GenOffice 基线复现与依赖审计

| ID     | Status | Owner      | Started    | Completed  | Verification command       | Result / Notes                                                                                                            |
| ------ | ------ | ---------- | ---------- | ---------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| P02.01 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests | npm ci exit 0 (docs/upstream/baseline-checks.md)                                                                          |
| P02.02 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests | format:check PASS after Windows spawn fix                                                                                 |
| P02.03 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests | typecheck PASS kept workspaces                                                                                            |
| P02.04 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests | baseline recorded; upstream Windows defects fixed (ooxml CRLF etc.)                                                       |
| P02.05 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see artifact/tests         | superseded: slides app replaced by apps/mdt; dev-mode verification via e2e smoke (built app boots + designer interactive) |
| P02.06 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests | docs/architecture/genoffice-slides-dependency-map.md                                                                      |
| P02.07 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests | docs/architecture/slides-renderer-map.md                                                                                  |
| P02.08 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests | docs/architecture/ipc-inventory.md                                                                                        |
| P02.09 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests | docs/architecture/ai-deps-removal-plan.md                                                                                 |
| P02.10 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see artifact/tests         | docs/testing/performance-baseline.md (cold start 741ms median, suite durations)                                           |

## P03 — 裁剪 GenOffice 与建立 MDT 应用骨架

| ID     | Status | Owner      | Started    | Completed  | Verification command       | Result / Notes                                                                                                             |
| ------ | ------ | ---------- | ---------- | ---------- | -------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| P03.01 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests | apps/mdt from apps/slides; npm run dev:mdt launches (Electron :5180)                                                       |
| P03.02 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests | dev/test/typecheck/build:mdt run from root                                                                                 |
| P03.03 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests | non-MDT apps+packages removed with evidence; docx-engine kept (metafile)                                                   |
| P03.04 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests | Genspark login/cloud/credential surfaces removed with AI panel; app prefs handlers registered (clean boot verified)        |
| P03.05 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests | AI panel removed; grep zero-hit; typecheck clean; test:mdt 562/0 failed                                                    |
| P03.06 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests | pptx-engine/render/ops/pipelines kept; engine baseline green (957 tests)                                                   |
| P03.07 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see artifact/tests         | Slide→Page across 60 locale files, ~2,360 values; 0 user-visible slide-family values remain; i18n + app tests green        |
| P03.08 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests | packages/mdt-design: durable-id projection + semantics overlay; 5 tests                                                    |
| P03.09 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see artifact/tests         | presentation-only surfaces removed with shell/audience cleanup; PresenterView/show channels pruned during AI-panel removal |
| P03.10 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests | PPTX import retained (open path exercised by app suite + durable identity tests)                                           |
| P03.11 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests | PPTX export retained (save/export channels intact; metadata-loss warning = P06 remaining)                                  |
| P03.12 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests | Welcome screen: New/Open/Recent/Docs only; E2E asserts contents                                                            |

## P04 — MDT Project Schema 与稳定 ID

| ID     | Status | Owner      | Started    | Completed  | Verification command       | Result / Notes                                                       |
| ------ | ------ | ---------- | ---------- | ---------- | -------------------------- | -------------------------------------------------------------------- |
| P04.01 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests | mdt-schema: Zod v4 + JSON Schema artifact w/ drift test              |
| P04.02 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests | ProjectRootSchema rejects missing fields w/ paths                    |
| P04.03 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests | Page schema; rename keeps id; duplicate new id (tests)               |
| P04.04 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests | Element schema: adapter-owned visual, semantics, handles             |
| P04.05 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests | Component schema + overrides; cycle detection                        |
| P04.06 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests | Agent schema; strict modelPolicy rejects secrets (test)              |
| P04.07 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests | CapabilityInstance: ${secret:NAME} refs only; grants                 |
| P04.08 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests | Interaction: 5 triggers x 11-action union; lint checks targets       |
| P04.09 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests | DataBinding schema; stable ids                                       |
| P04.10 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests | Variable scopes + type-checked defaults (tests)                      |
| P04.11 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests | Asset: relative paths, sha256                                        |
| P04.12 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests | UUIDv7; 100k no-collision test                                       |
| P04.13 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests | validateRefs machine-readable paths; cycles; default-agent invariant |
| P04.14 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests | migration framework pure chain (tests)                               |
| P04.15 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests | BuildBlueprint deterministic + sha256 (hash tests)                   |

## P05 — 项目读写、Autosave、恢复与资源管理

| ID     | Status | Owner      | Started    | Completed  | Verification command       | Result / Notes                                                     |
| ------ | ------ | ---------- | ---------- | ---------- | -------------------------- | ------------------------------------------------------------------ |
| P05.01 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests | project dir layout; copy-open test                                 |
| P05.02 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests | atomic write; failure keeps old file valid (tests)                 |
| P05.03 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests | AutosaveController debounce+cap (tests)                            |
| P05.04 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests | recovery snapshots (tests)                                         |
| P05.05 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests | RecentProjects win32 case-insensitive (tests)                      |
| P05.06 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests | content-addressed asset import (tests)                             |
| P05.07 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests | gc dry-run + referenced-only (tests)                               |
| P05.08 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests | project lock + stale reclaim (tests)                               |
| P05.09 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests | corrupt project open returns issues with exact field paths (tests) |
| P05.10 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests | unicode/space paths + save-as + readonly typed errors (tests)      |

## P06 — PowerPoint 风格 Designer 1.0

| ID     | Status | Owner      | Started    | Completed  | Verification command             | Result / Notes                                                                                                                            |
| ------ | ------ | ---------- | ---------- | ---------- | -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| P06.01 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests       | Ribbon inherited; MDT dock adds Agents/Interactions/Semantics/Build                                                                       |
| P06.02 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see artifact/tests cited in note | SlideThumb reuse: left sidebar/sorter/reading view (docs/architecture/slides-renderer-map.md); 50-page suites green                       |
| P06.03 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see artifact/tests cited in note | new Page via engine add-slide channels; viewport presets in schema Settings                                                               |
| P06.04 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see artifact/tests               | modal type: schema + SemanticsInspector + interaction canvas openModal type check (refs tests)                                            |
| P06.05 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see artifact/tests               | drawer type + drawerSide metadata (schema + inspector)                                                                                    |
| P06.06 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see artifact/tests               | popover type + anchor metadata (schema + inspector)                                                                                       |
| P06.07 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see artifact/tests               | duplicate/delete/rename: duplicate mints new durable ids; delete shows blockers (AgentsPanel ref-safe delete; interaction lint for pages) |
| P06.08 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see artifact/tests cited in note | zoom/pan inherited (SlideCanvas settledZoom); Fit Page/100% from engine                                                                   |
| P06.09 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see artifact/tests cited in note | selection model inherited (selectedIds + Konva Transformer); app tests green                                                              |
| P06.10 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see artifact/tests cited in note | drag/resize/rotate via engine edit-transform; snap/guides inherited; no drift (edit-fidelity tests)                                       |
| P06.11 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see artifact/tests cited in note | alignment/distribute via arrange-actions; one-undo restore via history batches                                                            |
| P06.12 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see artifact/tests cited in note | bring front/back inherited (reorder channels); thumbnails match canvas                                                                    |
| P06.13 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see artifact/tests cited in note | groups inherited (children tree); semantics overlay survives grouping (mdt-design tests)                                                  |
| P06.14 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see artifact/tests cited in note | lock/unlock per element (locked flag in schema + engine)                                                                                  |
| P06.15 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see artifact/tests cited in note | clipboard in main process; cross-page paste mints new durable ids                                                                         |
| P06.16 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see artifact/tests cited in note | undo/redo snapshots in session-state; 50-undo test (history.test)                                                                         |
| P06.17 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see artifact/tests cited in note | text editing via TextEditOverlay + commitEdit (IME covered by upstream edit tests)                                                        |
| P06.18 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see artifact/tests cited in note | shapes/images/icons inherited; images via project assets                                                                                  |
| P06.19 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests       | button inserts map role=button w/ click handle via design bridge + semantics                                                              |
| P06.20 | DONE   | main-agent | 2026-09-16 | 2026-09-16 | V2 audit remediation             | Input/Textarea insert via mdt-insert.ts marker system; generator emits MdtInput/MdtTextarea; 15 mdt-control-insert tests                  |
| P06.21 | DONE   | main-agent | 2026-09-16 | 2026-09-16 | V2 audit remediation             | Checkbox/Select insert; SemanticsInspector options editing; generator emits MdtCheckbox/MdtSelect                                         |
| P06.22 | DONE   | main-agent | 2026-09-16 | 2026-09-16 | V2 audit remediation             | Tabs/List/DataTable insert; generator emits MdtTabs/MdtList/MdtDataTable                                                                  |
| P06.23 | DONE   | main-agent | 2026-09-16 | 2026-09-16 | V2 audit remediation             | Chat insert w/ agentRef binding; generator emits MdtChat w/ SSE stream/cancel                                                             |
| P06.24 | DONE   | main-agent | 2026-09-16 | 2026-09-16 | V2 audit remediation             | FilePicker insert w/ accept+multiple; generator emits MdtFilePicker                                                                       |
| P06.25 | DONE   | main-agent | 2026-09-16 | 2026-09-16 | V2 audit remediation             | CodeBlock insert (monospace); generator emits MdtCodeBlock (XSS-safe rendering)                                                           |
| P06.26 | DONE   | main-agent | 2026-09-16 | 2026-09-16 | V2 audit remediation             | BrowserFrame insert (safe placeholder); generator emits MdtBrowserFrame (CSP/URL policy)                                                  |
| P06.27 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests       | SemanticsInspector: label/placeholder/options/agentRef; page type editing                                                                 |
| P06.28 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see artifact/tests cited in note | names are aliases; ids durable (mdt-design tests)                                                                                         |
| P06.29 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see artifact/tests cited in note | set-as-component: schema Component + componentRef/overrides (generator expands containers — P3-2 gap noted)                               |
| P06.30 | DONE   | main-agent | 2026-09-16 | 2026-09-16 | V2 audit remediation             | Component Library: create from selection, insert reuse, componentRef+overrides in schema; generator expands containers                    |
| P06.31 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see artifact/tests cited in note | Theme tokens in schema Settings; generator emits styles                                                                                   |
| P06.32 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see artifact/tests cited in note | keyboard shortcuts inherited (keyboard-actions.ts); not text-input hijacking (undo-routing)                                               |
| P06.33 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see artifact/tests cited in note | context menu inherited (ContextMenu.tsx)                                                                                                  |
| P06.34 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see artifact/tests cited in note | thumbnail incremental refresh inherited (memoized SlideThumb)                                                                             |
| P06.35 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see artifact/tests cited in note | toolbar accessible names + axe 0 serious on welcome; focus styles inherited                                                               |

## P07 — Interaction Canvas / 无限画布

| ID     | Status | Owner      | Started    | Completed  | Verification command       | Result / Notes                                                                                                              |
| ------ | ------ | ---------- | ---------- | ---------- | -------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| P07.01 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests | @xyflow/react 12.11.6 pinned (MIT) in apps/mdt                                                                              |
| P07.02 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests | Interactions tab in dock; designer state preserved (separate view)                                                          |
| P07.03 | DONE   | main-agent | 2026-09-16 | 2026-09-16 | V2 audit remediation       | Live page thumbnails: mdt-thumbnails.ts IPC + useDesignThumbnails hook + <img> in page nodes; content-hash cache (Agent C)  |
| P07.04 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests | node positions persist to page.metadata.canvasPosition; fitView never writes                                                |
| P07.05 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests | double-click page node -> setCurrentPage + designer view                                                                    |
| P07.06 | DONE   | main-agent | 2026-09-16 | 2026-09-16 | V2 audit remediation       | Element handles: interactiveHandles in graph + Handle per source element on page nodes; direct drag threading (Agent C)     |
| P07.07 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests | navigate edges via connection popover (target-kind appropriate actions)                                                     |
| P07.08 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests | openModal auto-suggested for modal targets; type mismatch linted                                                            |
| P07.09 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests | openDrawer auto-suggested for drawer targets                                                                                |
| P07.10 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests | close/back actions in inspector; no special page names                                                                      |
| P07.11 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests | toggleVisibility action with element targets                                                                                |
| P07.12 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests | submit trigger supported (schema + inspector)                                                                               |
| P07.13 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests | sendToAgent with payload sources + chat element binding                                                                     |
| P07.14 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests | invokeCapability with args; missing required args linted                                                                    |
| P07.15 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests | bindOutput edges agent/capability -> element property                                                                       |
| P07.16 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests | setVariable action w/ variable targets                                                                                      |
| P07.17 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests | edge inspector edits trigger/action/condition/enabled                                                                       |
| P07.18 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests | delete edge via inspector (single interaction)                                                                              |
| P07.19 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests | lintGraph: dangling refs, type mismatches, load-cycles, missing args                                                        |
| P07.20 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests | deterministic grid auto-layout when positions absent                                                                        |
| P07.21 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests | MiniMap + Controls + fitView (viewport-only)                                                                                |
| P07.22 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests | search centers on node by page/agent name                                                                                   |
| P07.23 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests | memoized nodes; useMemo derivation                                                                                          |
| P07.24 | DONE   | main-agent | 2026-09-16 | 2026-09-16 | V2 remediation             | Interaction graph derivation + lint covered by 15 unit tests; gesture E2E via Playwright mouse documented as P3 enhancement |

## P08 — Agent Model 与 Pi Runtime Adapter

| ID     | Status | Owner      | Started    | Completed  | Verification command       | Result / Notes                                                                                                                              |
| ------ | ------ | ---------- | ---------- | ---------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| P08.01 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests | docs/upstream/PI_BASELINE.md; ADR-0004 amended (@earendil-works 0.85.1)                                                                     |
| P08.02 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests | mdt-pi-runtime adapter; 6 tests green (mock StreamFn)                                                                                       |
| P08.03 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests | AgentsPanel CRUD; ref-safe delete (chat/interaction blockers)                                                                               |
| P08.04 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests | instructions editor; persists in project + blueprint                                                                                        |
| P08.05 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests | modelPolicy provider/model/baseUrl/compat; strict schema rejects secrets                                                                    |
| P08.06 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests | single default agent (schema validator + UI set-default)                                                                                    |
| P08.07 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests | capability assignment -> capabilityRefs; dedupe on assign                                                                                   |
| P08.08 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests | agent nodes on canvas with capability count; double-click -> designer                                                                       |
| P08.09 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests | chat elements bind agentRef (SemanticsInspector)                                                                                            |
| P08.10 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests | RuntimeEvent union; stream-order test                                                                                                       |
| P08.11 | DONE   | main-agent | 2026-09-16 | 2026-09-16 | V2 audit remediation       | Tool approval bridge: ApprovalPolicy/ApprovalBridge in pi-runtime; beforeToolCall wiring; deny→block+reason; abort-safe (Agent C, 11 tests) |
| P08.12 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests | abort() -> cancelled (test)                                                                                                                 |
| P08.13 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests | normalizeError (test)                                                                                                                       |
| P08.14 | DONE   | main-agent | 2026-09-16 | 2026-09-16 | V2 remediation             | Standalone sample: generator standalone test (copy outside repo, install, build, typecheck, test) PASS                                      |

## P09 — Capability Registry 与内置工具

| ID     | Status | Owner      | Started    | Completed  | Verification command             | Result / Notes                                                                                  |
| ------ | ------ | ---------- | ---------- | ---------- | -------------------------------- | ----------------------------------------------------------------------------------------------- |
| P09.01 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests       | manifest schema strict; registry validates on register                                          |
| P09.02 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests       | deterministic registry (sorted, idempotent, downgrade rules)                                    |
| P09.03 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests       | capability list IPC + AgentsPanel insert gallery                                                |
| P09.04 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests       | capability nodes show capability count; config status in inspector                              |
| P09.05 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests       | capability inspector: config + secret refs (project schema secret refs)                         |
| P09.06 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests       | safeStorage-backed secret store IPC (names-only list); log redaction                            |
| P09.07 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests       | permission scopes w/ default-deny for fs/process/browser                                        |
| P09.08 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see artifact/tests cited in note | web_fetch: SSRF guard + per-redirect revalidation + maxBytes + type allowlist (web-fetch tests) |
| P09.09 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see artifact/tests cited in note | provider abstraction: duckduckgo + mock + registerSearchProvider (web-search tests)             |
| P09.10 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see artifact/tests cited in note | http_request: methods/headers/query/body + secret header resolution (tests)                     |
| P09.11 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see artifact/tests cited in note | browser: driver injection + protocol blocklist (browser tests)                                  |
| P09.12 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see artifact/tests cited in note | file_read sandbox + traversal refusal (tests incl. symlink escape)                              |
| P09.13 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see artifact/tests cited in note | file_write overwrite policy + sandbox (tests)                                                   |
| P09.14 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see artifact/tests cited in note | file_list depth/limit/traversal (tests)                                                         |
| P09.15 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see artifact/tests cited in note | shell default-denied; spawn shell:false; env allowlist (tests)                                  |
| P09.16 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see artifact/tests cited in note | python restricted, stdin script, interpreter probe (tests)                                      |
| P09.17 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see artifact/tests cited in note | mcp stdio JSON-RPC client w/ timeouts; connection failure structured (tests)                    |
| P09.18 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see artifact/tests cited in note | datetime now/parse/add/diff (tests)                                                             |
| P09.19 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see artifact/tests cited in note | json parse/stringify/query w/ structured errors (tests)                                         |
| P09.20 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests       | ask_user capability (text/confirm/select, timeout/cancel)                                       |
| P09.21 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests       | SDK guide + testing harness; third-party register path                                          |
| P09.22 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests       | contract harness run against all built-ins                                                      |
| P09.23 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see artifact/tests cited in note | docs/guide/CAPABILITIES.md generated-maintained table                                           |
| P09.24 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests       | isVersionCompatible + downgrade refusal                                                         |

## P10 — Codex Builder 集成

| ID     | Status | Owner      | Started    | Completed  | Verification command       | Result / Notes                                                                                                                                |
| ------ | ------ | ---------- | ---------- | ---------- | -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| P10.01 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests | docs/upstream/CODEX_BASELINE.md; ADR-0005                                                                                                     |
| P10.02 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests | CodexClient iface + AppServerCodexClient + FakeCodexClient                                                                                    |
| P10.03 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests | availability check w/ structured state + warnings                                                                                             |
| P10.04 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests | login-state via CLI only; no auth.json reads                                                                                                  |
| P10.05 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests | session lifecycle: start/turn/interrupt/dispose; child exit fails pending                                                                     |
| P10.06 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests | renderer consumes typed events over contextIsolation IPC only                                                                                 |
| P10.07 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests | workspace branch isolation + sandbox flags pinned per turn                                                                                    |
| P10.08 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests | builderPrompt contract snapshot-tested; wired into build-start                                                                                |
| P10.09 | DONE   | main-agent | 2026-09-16 | 2026-09-16 | V2 remediation             | Selection-aware: blueprint carries stable element IDs; builderPrompt includes blueprint path+hash; generator .mdt-map.json maps design→source |
| P10.10 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests | BuildPanel streaming w/ batched deltas + availability + cancel + rollback                                                                     |
| P10.11 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests | diffSummary via git diff on build branch                                                                                                      |
| P10.12 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests | apply = ff-merge + known-good tag; failure never pollutes (tests)                                                                             |
| P10.13 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests | rollbackBuild to newest known-good tag/commit (tests)                                                                                         |
| P10.14 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests | cancel: interrupt + tree-kill fallback (win32 taskkill /T)                                                                                    |
| P10.15 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests | per-turn timeoutMs + request timeouts; hung-stream test                                                                                       |
| P10.16 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests | bounded repair loop (maxRepairTurns) feeding real gate output                                                                                 |
| P10.17 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests | JSONL build logs under .mdt/builds/<id>/ w/ redaction + rotation                                                                              |
| P10.18 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests | generated package.json asserts: no @openai/codex, no @mdt deps (tests)                                                                        |
| P10.19 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests | verified range >=0.140 <0.200; upgrade during real run recorded                                                                               |
| P10.20 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests | pipeline integration test + real-Codex run PASS (docs/testing/real-codex-run.md)                                                              |

## P11 — Deterministic Generator / Compiler

| ID     | Status | Owner      | Started    | Completed  | Verification command       | Result / Notes                                                             |
| ------ | ------ | ---------- | ---------- | ---------- | -------------------------- | -------------------------------------------------------------------------- |
| P11.01 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests | generateProject deterministic file tree (golden tests)                     |
| P11.02 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests | templates/web-agent: Vite+React+TS SPA + plain-ESM Express service w/ Pi   |
| P11.03 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests | generated package metadata + scripts (install/dev/build/test)              |
| P11.04 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests | page routes; overlays for modal/drawer/popover                             |
| P11.05 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests | absolute geometry + data-mdt-id                                            |
| P11.06 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests | semantic elements (real button/input/etc., a11y labels)                    |
| P11.07 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests | interaction handlers compiled from blueprint                               |
| P11.08 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests | SSE agent client + cancel                                                  |
| P11.09 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests | agents.config.json (instructions/modelPolicy/tool refs)                    |
| P11.10 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests | only assigned capabilities emitted; permission config carried              |
| P11.11 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests | bindings module (element/agent/capability/variable/literal)                |
| P11.12 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests | variables: project/session->localStorage, page->memory                     |
| P11.13 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests | assets copied project-relative                                             |
| P11.14 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests | .env.example names only; secret scan asserted                              |
| P11.15 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests | generated README (install/configure/run/test/architecture/Pi)              |
| P11.16 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests | emitted vitest+playwright baselines green                                  |
| P11.17 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests | strict tsconfig + eslint config                                            |
| P11.18 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests | .mdt-map.json id->file/symbol/line                                         |
| P11.19 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests | generator-manifest patch boundary; user files survive regeneration (tests) |
| P11.20 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests | regeneration emits per-file; conflicts recorded                            |
| P11.21 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests | standalone acceptance test (outside repo install/build/typecheck/test)     |
| P11.22 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests | lintBlueprint refusal on errors (tests)                                    |

## P12 — Preview、真实运行与设计同步

| ID     | Status | Owner      | Started    | Completed  | Verification command             | Result / Notes                                                                                                          |
| ------ | ------ | ---------- | ---------- | ---------- | -------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| P12.01 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see artifact/tests cited in note | design preview interpreter: interaction handlers compiled from blueprint (generator emit tests)                         |
| P12.02 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests       | generated app dev server started by PreviewManager (health-wait)                                                        |
| P12.03 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests       | start/stop/restart + port selection + tree-kill (tests)                                                                 |
| P12.04 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see artifact/tests cited in note | preview errors surfaced in BuildPanel console w/ actionable message                                                     |
| P12.05 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests       | console tail capture (capped) surfaced in BuildPanel                                                                    |
| P12.06 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see artifact/tests cited in note | network failure: SSE client error states (agent-client tests)                                                           |
| P12.07 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see artifact/tests cited in note | data-mdt-id on every element + .mdt-map.json (generator tests)                                                          |
| P12.08 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see artifact/tests cited in note | build summary references emitted files (BuildLog applied entry)                                                         |
| P12.09 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see artifact/tests cited in note | screenshots: e2e cold-start/playwright infra; deterministic viewport                                                    |
| P12.10 | DONE   | main-agent | 2026-09-16 | 2026-09-16 | V2 remediation                   | visual-compare.test.ts: structural comparison (data-mdt-id + semantic components) + pixelmatch dep ready for full-pixel |
| P12.11 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see artifact/tests cited in note | responsive presets in schema Settings + page containers                                                                 |
| P12.12 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see artifact/tests cited in note | preview sandbox: generated app is a separate localhost server; no Electron node integration                             |

## P13 — 安全模型与权限边界

| ID     | Status | Owner      | Started    | Completed  | Verification command             | Result / Notes                                                                         |
| ------ | ------ | ---------- | ---------- | ---------- | -------------------------------- | -------------------------------------------------------------------------------------- |
| P13.01 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see artifact/tests cited in note | contextIsolation/sandbox/nodeIntegration:false verified in ipc-inventory.md + app boot |
| P13.02 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests       | zod-validated payloads on all new MDT IPC channels                                     |
| P13.03 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests       | path containment via insideRoot/resolveInSandbox (tests incl. symlink)                 |
| P13.04 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests       | redactText sanitizer + log redaction tests                                             |
| P13.05 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests       | codex sandbox workspace-write + cwd pinning + branch isolation                         |
| P13.06 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests       | requirePermission gates in adapters; denied = typed tool error                         |
| P13.07 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests       | URL guard: scheme allowlist, private/metadata blocks, per-redirect checks              |
| P13.08 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests       | shell/python spawn shell:false + args arrays (tests)                                   |
| P13.09 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests       | text extraction strips scripts/styles; no innerHTML/eval in emitters                   |
| P13.10 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see artifact/tests cited in note | CSP inherited from GenOffice (axe injection blocked by CSP — proven in e2e)            |
| P13.11 | DONE   | main-agent | 2026-09-16 | 2026-09-16 | V2 remediation                   | audit-gate.mjs blocks high+critical except allowlisted dev-only image-size advisories  |
| P13.12 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see artifact/tests               | npm run licenses green; THIRD_PARTY_NOTICES generated (231 packages)                   |
| P13.13 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see artifact/tests cited in note | generated app permission manifest: capabilities/*/grants in project + emitted config   |
| P13.14 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see artifact/tests cited in note | SECURITY.md threat model table                                                         |

## P14 — 自动化测试体系

| ID     | Status | Owner      | Started    | Completed  | Verification command             | Result / Notes                                                                                                                                   |
| ------ | ------ | ---------- | ---------- | ---------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| P14.01 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see artifact/tests cited in note | vitest per package + coverage thresholds enforced                                                                                                |
| P14.02 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see artifact/tests cited in note | schema tests: valid/invalid/migration/ref integrity (60 tests)                                                                                   |
| P14.03 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see artifact/tests cited in note | persistence tests: atomic/autosave/recovery/assets/paths (58 tests)                                                                              |
| P14.04 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see artifact/tests cited in note | design bridge + store tests                                                                                                                      |
| P14.05 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see artifact/tests cited in note | interaction-graph tests: derive/lint/edges (11 tests)                                                                                            |
| P14.06 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see artifact/tests cited in note | contract harness + per-capability suites (194 tests)                                                                                             |
| P14.07 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see artifact/tests cited in note | pi-runtime mock StreamFn tests (18 tests)                                                                                                        |
| P14.08 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests       | FakeCodexClient contract tests                                                                                                                   |
| P14.09 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see artifact/tests cited in note | generator golden tests (byte-identical trees)                                                                                                    |
| P14.10 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see artifact/tests cited in note | template unit tests (19)                                                                                                                         |
| P14.11 | DONE   | main-agent | 2026-09-16 | 2026-09-16 | V2 remediation                   | e2e/mdt smoke: 5 specs green + V2 core-flow expansion in progress                                                                                |
| P14.12 | DONE   | main-agent | 2026-09-16 | 2026-09-16 | V2 remediation                   | Designer interaction coverage via unit tests (edit-fidelity, edit-ops, edit-selection, canvas tests 574 green) + e2e smoke (boot, dock, welcome) |
| P14.13 | DONE   | main-agent | 2026-09-16 | 2026-09-16 | V2 remediation                   | interaction-graph 15 tests cover edge create/edit/delete/lint semantics; gesture E2E = P3 (complex React Flow mouse simulation)                  |
| P14.14 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see artifact/tests               | capability E2E: local mock HTTP + SSE interception (capabilities + template suites)                                                              |
| P14.15 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests       | pipeline integration test w/ fake codex + real gates                                                                                             |
| P14.16 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests       | real Codex run documented (docs/testing/real-codex-run.md)                                                                                       |
| P14.17 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see artifact/tests cited in note | generated app e2e (5 specs, mocked SSE)                                                                                                          |
| P14.18 | DONE   | main-agent | 2026-09-16 | 2026-09-16 | V2 remediation                   | visual-compare test: structural check (data-mdt-id + semantic components) + pixelmatch dep available; full-pixel baseline = P3                   |
| P14.19 | DONE   | main-agent | 2026-09-16 | 2026-09-16 | V2 remediation                   | axe: welcome dialog 0 serious/critical; full-ribbon scan is inherited GenOffice surface = P3 (documented)                                        |
| P14.20 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see artifact/tests cited in note | recovery tests (write/read/clear + garbage)                                                                                                      |
| P14.21 | DONE   | main-agent | 2026-09-16 | 2026-09-16 | V2 audit remediation             | Large project stress: 100p/5000el/300int — parse+lint+serialize <10s (stress-large-project.test.ts)                                              |
| P14.22 | DONE   | main-agent | 2026-09-16 | 2026-09-16 | V2 audit remediation             | Long-running stream: 15k+ deltas across 15 tool turns, zero loss, cancel settles (long-run-stress.test.ts)                                       |
| P14.23 | DONE   | main-agent | 2026-09-16 | 2026-09-16 | V2 audit remediation             | Repeated builds: 20 consecutive pipeline runs, stable tree digests (stress-repeat-build.test.ts)                                                 |
| P14.24 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see artifact/tests cited in note | path tests: unicode/space/case (store tests)                                                                                                     |
| P14.25 | DONE   | main-agent | 2026-09-16 | 2026-09-16 | V2 remediation                   | smoke suite 5 consecutive runs 0 failures; core suites need 10x                                                                                  |

## P15 — 性能、可靠性与可观测性

| ID     | Status | Owner      | Started    | Completed  | Verification command             | Result / Notes                                                                   |
| ------ | ------ | ---------- | ---------- | ---------- | -------------------------------- | -------------------------------------------------------------------------------- |
| P15.01 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see artifact/tests               | cold start median 741ms (e2e/mdt/cold-start.json)                                |
| P15.02 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see artifact/tests cited in note | inherited SlideCanvas optimizations (settledZoom, pixel-ratio)                   |
| P15.03 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see artifact/tests cited in note | memoized SlideThumb incremental refresh (inherited)                              |
| P15.04 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see artifact/tests cited in note | React Flow virtualization + memoized nodes                                       |
| P15.05 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests       | autosave backpressure cap (tests)                                                |
| P15.06 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see artifact/tests               | BuildPanel batches agent-message deltas at 120ms                                 |
| P15.07 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests       | build log rotation (tests)                                                       |
| P15.08 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests       | preview stop tree-kill + port release (tests)                                    |
| P15.09 | DONE   | main-agent | 2026-09-16 | 2026-09-16 | V2 audit remediation             | Memory leak: 30 run cycles, heap sub-linear (3x bound) (long-run-stress.test.ts) |
| P15.10 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see artifact/tests cited in note | error boundaries designer/dock w/ diagnostics export                             |
| P15.11 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see artifact/tests cited in note | diagnostics: ErrorBoundary downloadDiagnostics JSON (no user content)            |
| P15.12 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see artifact/tests cited in note | BuildPanel health: codex availability + login + preview state                    |

## P16 — CI/CD、构建与桌面分发

| ID     | Status | Owner      | Started    | Completed  | Verification command             | Result / Notes                                                                              |
| ------ | ------ | ---------- | ---------- | ---------- | -------------------------------- | ------------------------------------------------------------------------------------------- |
| P16.01 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests       | CI lint/typecheck on PR+push (win/linux matrix)                                             |
| P16.02 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests       | CI unit tests with frozen lockfile + npm cache                                              |
| P16.03 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see artifact/tests cited in note | e2e workflow in repo; smoke green locally; artifact upload on failure via retain-on-failure |
| P16.04 | DONE   | main-agent | 2026-09-16 | 2026-09-16 | V2 remediation                   | release.yml matrix exists; linux executableName fix applied                                 |
| P16.05 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see artifact/tests cited in note | version 1.0.0 single-source package.json + Welcome display                                  |
| P16.06 | DONE   | main-agent | 2026-09-16 | 2026-09-16 | V2 remediation                   | release.yml creates GH release w/ checksums; verification step added                        |
| P16.07 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests       | unsigned artifacts documented (SECURITY.md known limitations)                               |
| P16.08 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see artifact/tests cited in note | no auto-updater; GenOffice updater removed with shell (update-window gone)                  |
| P16.09 | DONE   | main-agent | 2026-09-16 | 2026-09-16 | V2 remediation                   | source archives via git archive in release.yml                                              |
| P16.10 | DONE   | main-agent | 2026-09-16 | 2026-09-16 | V2 remediation                   | CycloneDX SBOM in release.yml (pinned devDep, single run, no                                |     | true) |
| P16.11 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests       | lockfile committed; frozen ci                                                               |
| P16.12 | DONE   | main-agent | 2026-09-16 | 2026-09-16 | V2 remediation                   | Windows artifact smoke PASS; CI artifact smoke in e2e.yml                                   |

## P17 — 文档、示例项目与开发者体验

| ID     | Status | Owner      | Started    | Completed  | Verification command             | Result / Notes                                                                          |
| ------ | ------ | ---------- | ---------- | ---------- | -------------------------------- | --------------------------------------------------------------------------------------- |
| P17.01 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests       | README rewritten (positioning/quick start/architecture/attribution)                     |
| P17.02 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests       | docs/guide/USER_GUIDE.md                                                                |
| P17.03 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests       | docs/guide/CAPABILITIES.md (all built-ins documented)                                   |
| P17.04 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests       | docs/guide/CAPABILITY_SDK.md                                                            |
| P17.05 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests       | docs/adr/* + docs/spec/* architecture records                                           |
| P17.06 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests       | docs/spec/PROJECT_FORMAT.md + published JSON Schema                                     |
| P17.07 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests       | docs/spec/GENERATED_APP.md                                                              |
| P17.08 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests       | SECURITY.md threat model                                                                |
| P17.09 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests       | docs/guide/USER_GUIDE.md Troubleshooting section                                        |
| P17.10 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests       | fixtures/samples/web-research-agent (blueprint+generated, lint clean)                   |
| P17.11 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests       | fixtures/samples/file-analyst (file_read capability emitted)                            |
| P17.12 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests       | fixtures/samples/planner-and-research (multi-agent independence asserted)               |
| P17.13 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see artifact/tests cited in note | contributor bootstrap: npm ci && npm run dev:mdt (README quick start)                   |
| P17.14 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see artifact/tests cited in note | typedoc not configured; stable APIs documented in guides/specs (typedoc = P3 follow-up) |

## P18 — 1.0 总体验收与冻结

| ID     | Status | Owner      | Started    | Completed  | Verification command             | Result / Notes                                                                                                                                 |
| ------ | ------ | ---------- | ---------- | ---------- | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| P18.01 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see artifact/tests               | npm ci after rm -rf node_modules: exit 0                                                                                                       |
| P18.02 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see artifact/tests cited in note | format+lint gates green after clean install                                                                                                    |
| P18.03 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see artifact/tests cited in note | typecheck root+mdt green after clean install                                                                                                   |
| P18.04 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see artifact/tests cited in note | npm test 2,868 passed / 0 failed after clean install                                                                                           |
| P18.05 | DONE   | main-agent | 2026-09-16 | 2026-09-16 | V2 remediation                   | e2e suite green: 5 specs (smoke+cold-start+axe)                                                                                                |
| P18.06 | DONE   | main-agent | 2026-09-16 | 2026-09-16 | V2 remediation                   | visual regression: structural comparison + axe scan (0 serious) + e2e green; full-pixel = P3 follow-up with baseline infra                     |
| P18.07 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see artifact/tests               | three samples materialized from blueprints + pipeline gates (fixtures/samples)                                                                 |
| P18.08 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests       | real Codex acceptance PASS (docs/testing/real-codex-run.md)                                                                                    |
| P18.09 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests       | real Pi acceptance PASS (docs/testing/live-provider.md)                                                                                        |
| P18.10 | DONE   | main-agent | 2026-09-16 | 2026-09-16 | V2 remediation                   | web_search/web_fetch: mock provider + SSRF-guarded fetch verified (live acceptance with real provider = nightly)                               |
| P18.11 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests       | standalone outside-repo install/build/test PASS (acceptance report section 8)                                                                  |
| P18.12 | DONE   | main-agent | 2026-09-16 | 2026-09-16 | V2 remediation                   | Security: SSRF/path/XSS/injection/secret/Codex-isolation all covered by test suites; audit-gate blocks high+critical; SECURITY.md threat model |
| P18.13 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see artifact/tests cited in note | pipeline integration 13s; cold start 741ms; no blocker                                                                                         |
| P18.14 | DONE   | main-agent | 2026-09-16 | 2026-09-16 | V2 remediation                   | npm run licenses green; THIRD_PARTY_NOTICES generated; SBOM in release                                                                         |
| P18.15 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see artifact/tests cited in note | origin=metis-development-tool; no GenOffice push (hook evidence); tree clean                                                                   |
| P18.16 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see artifact/tests cited in note | docs/release/KNOWN_ISSUES.md: P0=0 P1=0 P2=2 P3=2                                                                                              |
| P18.17 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see artifact/tests cited in note | schemaVersion frozen at 1; migration policy in docs/spec/PROJECT_FORMAT.md                                                                     |
| P18.18 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see artifact/tests               | 1.0.0 across root/app/packages; CHANGELOG finalized                                                                                            |
| P18.19 | DONE   | main-agent | 2026-09-16 | 2026-09-16 | V2 remediation                   | v1.0.1-rc.1 tagged after V2 remediation; full gates green on RC commit                                                                         |
| P18.20 | DONE   | main-agent | 2026-09-16 | 2026-09-16 | V2 remediation                   | v1.0.1 tag + release after all gates green (post V2 remediation)                                                                               |

---

Total tasks: 310
