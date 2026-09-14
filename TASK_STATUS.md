 DONE | main-agent | 2026-09-15 | see commit history | docs/upstream/CODEX_BASELINE.md: app-server JSON-RPC verified from installed 0.144.1 schema; ADR-0005 || main-agent | 2026-09-15 | see commit history | normalizeError classification (test green) || main-agent | 2026-09-15 | see commit history | abort() → run resolves cancelled (test green) || main-agent | 2026-09-15 | see commit history | normalized RuntimeEvent union; stream-order test green || main-agent | 2026-09-15 | see commit history | packages/mdt-pi-runtime: createRuntimeAgent, modelFromPolicy, toolFromRegistered, capability bridge; 6 tests green w/ mock StreamFn || main-agent | 2026-09-15 | see commit history | docs/upstream/PI_BASELINE.md: @earendil-works/pi-agent-core@0.85.1 verified; ADR-0004 amended || main-agent | 2026-09-15 | see commit history | acquireLock/releaseLock with stale reclaim (tests) || main-agent | 2026-09-15 | see commit history | gc dry-run + referenced-only removal (tests) || main-agent | 2026-09-15 | see commit history | AssetStore content-addressed import + dedup (tests) || main-agent | 2026-09-15 | see commit history | RecentProjects: win32 case-insensitive identity, prune, corrupt-tolerant (tests) || main-agent | 2026-09-15 | see commit history | recovery snapshots write/read/clear; garbage-tolerant (tests) || main-agent | 2026-09-15 | see commit history | AutosaveController debounce+cap+failure-preserving (tests) || main-agent | 2026-09-15 | see commit history | atomicWriteFileSync (tmp+fsync+rename; win32 path); failure keeps old file valid (tests) || main-agent | 2026-09-15 | see commit history | project dir format mdt.project.json + assets/ design/ .mdt/; git-diffable; copy-open test || main-agent | 2026-09-15 | see commit history | BuildBlueprint: deterministic canonical JSON + sha256; UI state excluded (hash tests) || main-agent | 2026-09-15 | see commit history | migration framework: pure chain, input untouched, newer-version refusal (tests) || main-agent | 2026-09-15 | see commit history | validateRefs: machine-readable paths, page-type checks, capability arg lint, component cycles, single default agent || main-agent | 2026-09-15 | see commit history | UUIDv7 generator; 100k no-collision test || main-agent | 2026-09-15 | see commit history | Asset schema: relative paths, sha256, no absolute paths || main-agent | 2026-09-15 | see commit history | Variable schema: project/page/session scopes; type-checked defaults (tests) || main-agent | 2026-09-15 | see commit history | DataBinding schema (element/agent/capability/variable/literal sources); stable ids || main-agent | 2026-09-15 | see commit history | Interaction schema: 5 triggers x 11-action discriminated union; missing targets rejected by validator || main-agent | 2026-09-15 | see commit history | CapabilityInstance schema: ${secret:NAME} refs only; permission grants || main-agent | 2026-09-15 | see commit history | Agent schema; strict modelPolicy rejects smuggled secrets (test) || main-agent | 2026-09-15 | see commit history | Component schema + componentRef/overrides; cycle detection in ref validator || main-agent | 2026-09-15 | see commit history | Element schema: stable id, adapter-owned visual payload, semantics (roles/handles/componentRef/accessibility) || main-agent | 2026-09-15 | see commit history | Page schema (page/modal/drawer/popover/component); rename keeps id; duplicate makes new id (tests) || main-agent | 2026-09-15 | see commit history | ProjectRootSchema with all required sections; rejects missing fields w/ paths || main-agent | 2026-09-15 | see commit history | packages/mdt-schema: Zod v4 single-source + committed JSON Schema artifact w/ drift test || main-agent | 2026-09-15 | see commit history | AI panel + ai-ipc/attachments/cloud-gen/gsk removed; grep zero-hit; typecheck clean; test:mdt 562 passed/0 failed || main-agent | 2026-09-15 | see commit history | apps docs/sheets/pdf/markdown/html/shell/slides + packages cli/font-metrics/html2docx/pdf2docx/xlsx-gateway removed with evidence; docx-engine kept (metafile) || main-agent | 2026-09-15 | see commit history | dev:mdt/test:mdt/typecheck:mdt/build:mdt run from root || main-agent | 2026-09-15 | see commit history | apps/mdt from apps/slides; npm run dev:mdt launches (Electron + :5180) || main-agent | 2026-09-15 | see commit history | docs/architecture/ai-deps-removal-plan.md || main-agent | 2026-09-15 | see commit history | docs/architecture/ipc-inventory.md || main-agent | 2026-09-15 | see commit history | docs/architecture/slides-renderer-map.md || main-agent | 2026-09-15 | see commit history | docs/architecture/genoffice-slides-dependency-map.md || main-agent | 2026-09-15 | see commit history | per-workspace baseline recorded; upstream Windows defects fixed (electron-utils expectations, ooxml CRLF/warnings) || main-agent | 2026-09-15 | see commit history | typecheck PASS all kept workspaces || main-agent | 2026-09-15 | see commit history | format:check PASS after Windows spawn fix || main-agent | 2026-09-15 | see commit history | npm ci exit 0, lockfile untouched (docs/upstream/baseline-checks.md) || main-agent | 2026-09-15 | see commit history | CI workflow added with required checks; branch protection documented in CONTRIBUTING || main-agent | 2026-09-15 | see commit history | README/CONTRIBUTING rewritten; SECURITY.md/CODE_OF_CONDUCT.md inherited from upstream (Apache-2.0 project); CHANGELOG/ROADMAP added || main-agent | 2026-09-15 | see commit history | docs/upstream/UPDATE_GENOFFICE.md (fetch/diff/cherry-pick procedure, merge forbidden) || main-agent | 2026-09-15 | see commit history | LICENSE (Apache-2.0) kept; NOTICE updated; THIRD_PARTY_NOTICES.md written || main-agent | 2026-09-15 | see commit history | git push origin main OK; public clone verified via ls-remote || main-agent | 2026-09-15 | see commit history | invalid push URL + pre-push hook; simulated push fails (exit 128) || main-agent | 2026-09-15 | see commit history | docs/adr/README.md + ADR-0001..0007 written || main-agent | 2026-09-15 | see commit history | Conventional Commits used throughout; per-task logical commits || main-agent | 2026-09-15 | see commit history | failure-handling rules applied: baseline failures root-caused (format-changed spawn EINVAL, ooxml CRLF, platform-conditional tests); no assertion lowering || ID     | Status | Owner      | Started    | Completed  | Verification command                                               | Result / Notes                                                                                                                      |
| ------ | ------ | ---------- | ---------- | ---------- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| P00.01 | TODO   | main-agent |            |            |                                                                    |                                                                                                                                     |
| P00.02 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see docs/build-environment.md, docs/upstream/GENOFFICE_BASELINE.md | verified: toolchain versions recorded; baseline SHA immutable; push-block test exit=128; repo TZUKWAN/metis-development-tool PUBLIC |
| P00.03 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests | rules applied: baseline failures root-caused; no assertion lowering; P0/P1 get regression tests |
| P00.04 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests | Conventional Commits; per-task logical commits |
| P00.05 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests | docs/adr/README.md + ADR-0001..0007 |

## P01 — 上游拉取、新 GitHub 仓库与许可证

| ID     | Status | Owner      | Started    | Completed  | Verification command                                               | Result / Notes                                                                                                                      |
| ------ | ------ | ---------- | ---------- | ---------- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| P01.01 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see docs/build-environment.md, docs/upstream/GENOFFICE_BASELINE.md | verified: toolchain versions recorded; baseline SHA immutable; push-block test exit=128; repo TZUKWAN/metis-development-tool PUBLIC |
| P01.02 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see docs/build-environment.md, docs/upstream/GENOFFICE_BASELINE.md | verified: toolchain versions recorded; baseline SHA immutable; push-block test exit=128; repo TZUKWAN/metis-development-tool PUBLIC |
| P01.03 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see docs/build-environment.md, docs/upstream/GENOFFICE_BASELINE.md | verified: toolchain versions recorded; baseline SHA immutable; push-block test exit=128; repo TZUKWAN/metis-development-tool PUBLIC |
| P01.04 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests | invalid push URL + pre-push hook; simulated push fails exit 128 |
| P01.05 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see docs/build-environment.md, docs/upstream/GENOFFICE_BASELINE.md | verified: toolchain versions recorded; baseline SHA immutable; push-block test exit=128; repo TZUKWAN/metis-development-tool PUBLIC |
| P01.06 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests | pushed to TZUKWAN/metis-development-tool main; public |
| P01.07 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests | LICENSE Apache-2.0; NOTICE updated; THIRD_PARTY_NOTICES.md |
| P01.08 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests | docs/upstream/UPDATE_GENOFFICE.md (merge forbidden) |
| P01.09 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests | README/CONTRIBUTING rewritten; upstream governance files kept |
| P01.10 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests | CI workflow required checks; policy in CONTRIBUTING |

## P02 — GenOffice 基线复现与依赖审计

| ID     | Status | Owner      | Started | Completed | Verification command | Result / Notes |
| ------ | ------ | ---------- | ------- | --------- | -------------------- | -------------- |
| P02.01 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests | npm ci exit 0 (docs/upstream/baseline-checks.md) |
| P02.02 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests | format:check PASS after Windows spawn fix |
| P02.03 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests | typecheck PASS kept workspaces |
| P02.04 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests | baseline recorded; upstream Windows defects fixed (ooxml CRLF etc.) |
| P02.05 | TODO   | main-agent |         |           |                      |                |
| P02.06 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests | docs/architecture/genoffice-slides-dependency-map.md |
| P02.07 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests | docs/architecture/slides-renderer-map.md |
| P02.08 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests | docs/architecture/ipc-inventory.md |
| P02.09 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests | docs/architecture/ai-deps-removal-plan.md |
| P02.10 | TODO   | main-agent |         |           |                      |                |

## P03 — 裁剪 GenOffice 与建立 MDT 应用骨架

| ID     | Status | Owner      | Started | Completed | Verification command | Result / Notes |
| ------ | ------ | ---------- | ------- | --------- | -------------------- | -------------- |
| P03.01 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests | apps/mdt from apps/slides; npm run dev:mdt launches (Electron :5180) |
| P03.02 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests | dev/test/typecheck/build:mdt run from root |
| P03.03 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests | non-MDT apps+packages removed with evidence; docx-engine kept (metafile) |
| P03.04 | TODO   | main-agent |         |           |                      |                |
| P03.05 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests | AI panel removed; grep zero-hit; typecheck clean; test:mdt 562/0 failed |
| P03.06 | TODO   | main-agent |         |           |                      |                |
| P03.07 | TODO   | main-agent |         |           |                      |                |
| P03.08 | TODO   | main-agent |         |           |                      |                |
| P03.09 | TODO   | main-agent |         |           |                      |                |
| P03.10 | TODO   | main-agent |         |           |                      |                |
| P03.11 | TODO   | main-agent |         |           |                      |                |
| P03.12 | TODO   | main-agent |         |           |                      |                |

## P04 — MDT Project Schema 与稳定 ID

| ID     | Status | Owner      | Started | Completed | Verification command | Result / Notes |
| ------ | ------ | ---------- | ------- | --------- | -------------------- | -------------- |
| P04.01 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests | mdt-schema: Zod v4 + JSON Schema artifact w/ drift test |
| P04.02 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests | ProjectRootSchema rejects missing fields w/ paths |
| P04.03 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests | Page schema; rename keeps id; duplicate new id (tests) |
| P04.04 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests | Element schema: adapter-owned visual, semantics, handles |
| P04.05 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests | Component schema + overrides; cycle detection |
| P04.06 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests | Agent schema; strict modelPolicy rejects secrets (test) |
| P04.07 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests | CapabilityInstance: ${secret:NAME} refs only; grants |
| P04.08 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests | Interaction: 5 triggers x 11-action union; lint checks targets |
| P04.09 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests | DataBinding schema; stable ids |
| P04.10 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests | Variable scopes + type-checked defaults (tests) |
| P04.11 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests | Asset: relative paths, sha256 |
| P04.12 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests | UUIDv7; 100k no-collision test |
| P04.13 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests | validateRefs machine-readable paths; cycles; default-agent invariant |
| P04.14 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests | migration framework pure chain (tests) |
| P04.15 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests | BuildBlueprint deterministic + sha256 (hash tests) |

## P05 — 项目读写、Autosave、恢复与资源管理

| ID     | Status | Owner      | Started | Completed | Verification command | Result / Notes |
| ------ | ------ | ---------- | ------- | --------- | -------------------- | -------------- |
| P05.01 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests | project dir layout; copy-open test |
| P05.02 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests | atomic write; failure keeps old file valid (tests) |
| P05.03 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests | AutosaveController debounce+cap (tests) |
| P05.04 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests | recovery snapshots (tests) |
| P05.05 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests | RecentProjects win32 case-insensitive (tests) |
| P05.06 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests | content-addressed asset import (tests) |
| P05.07 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests | gc dry-run + referenced-only (tests) |
| P05.08 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests | project lock + stale reclaim (tests) |
| P05.09 | TODO   | main-agent |         |           |                      |                |
| P05.10 | TODO   | main-agent |         |           |                      |                |

## P06 — PowerPoint 风格 Designer 1.0

| ID     | Status | Owner      | Started | Completed | Verification command | Result / Notes |
| ------ | ------ | ---------- | ------- | --------- | -------------------- | -------------- |
| P06.01 | TODO   | main-agent |         |           |                      |                |
| P06.02 | TODO   | main-agent |         |           |                      |                |
| P06.03 | TODO   | main-agent |         |           |                      |                |
| P06.04 | TODO   | main-agent |         |           |                      |                |
| P06.05 | TODO   | main-agent |         |           |                      |                |
| P06.06 | TODO   | main-agent |         |           |                      |                |
| P06.07 | TODO   | main-agent |         |           |                      |                |
| P06.08 | TODO   | main-agent |         |           |                      |                |
| P06.09 | TODO   | main-agent |         |           |                      |                |
| P06.10 | TODO   | main-agent |         |           |                      |                |
| P06.11 | TODO   | main-agent |         |           |                      |                |
| P06.12 | TODO   | main-agent |         |           |                      |                |
| P06.13 | TODO   | main-agent |         |           |                      |                |
| P06.14 | TODO   | main-agent |         |           |                      |                |
| P06.15 | TODO   | main-agent |         |           |                      |                |
| P06.16 | TODO   | main-agent |         |           |                      |                |
| P06.17 | TODO   | main-agent |         |           |                      |                |
| P06.18 | TODO   | main-agent |         |           |                      |                |
| P06.19 | TODO   | main-agent |         |           |                      |                |
| P06.20 | TODO   | main-agent |         |           |                      |                |
| P06.21 | TODO   | main-agent |         |           |                      |                |
| P06.22 | TODO   | main-agent |         |           |                      |                |
| P06.23 | TODO   | main-agent |         |           |                      |                |
| P06.24 | TODO   | main-agent |         |           |                      |                |
| P06.25 | TODO   | main-agent |         |           |                      |                |
| P06.26 | TODO   | main-agent |         |           |                      |                |
| P06.27 | TODO   | main-agent |         |           |                      |                |
| P06.28 | TODO   | main-agent |         |           |                      |                |
| P06.29 | TODO   | main-agent |         |           |                      |                |
| P06.30 | TODO   | main-agent |         |           |                      |                |
| P06.31 | TODO   | main-agent |         |           |                      |                |
| P06.32 | TODO   | main-agent |         |           |                      |                |
| P06.33 | TODO   | main-agent |         |           |                      |                |
| P06.34 | TODO   | main-agent |         |           |                      |                |
| P06.35 | TODO   | main-agent |         |           |                      |                |

## P07 — Interaction Canvas / 无限画布

| ID     | Status | Owner      | Started | Completed | Verification command | Result / Notes |
| ------ | ------ | ---------- | ------- | --------- | -------------------- | -------------- |
| P07.01 | TODO   | main-agent |         |           |                      |                |
| P07.02 | TODO   | main-agent |         |           |                      |                |
| P07.03 | TODO   | main-agent |         |           |                      |                |
| P07.04 | TODO   | main-agent |         |           |                      |                |
| P07.05 | TODO   | main-agent |         |           |                      |                |
| P07.06 | TODO   | main-agent |         |           |                      |                |
| P07.07 | TODO   | main-agent |         |           |                      |                |
| P07.08 | TODO   | main-agent |         |           |                      |                |
| P07.09 | TODO   | main-agent |         |           |                      |                |
| P07.10 | TODO   | main-agent |         |           |                      |                |
| P07.11 | TODO   | main-agent |         |           |                      |                |
| P07.12 | TODO   | main-agent |         |           |                      |                |
| P07.13 | TODO   | main-agent |         |           |                      |                |
| P07.14 | TODO   | main-agent |         |           |                      |                |
| P07.15 | TODO   | main-agent |         |           |                      |                |
| P07.16 | TODO   | main-agent |         |           |                      |                |
| P07.17 | TODO   | main-agent |         |           |                      |                |
| P07.18 | TODO   | main-agent |         |           |                      |                |
| P07.19 | TODO   | main-agent |         |           |                      |                |
| P07.20 | TODO   | main-agent |         |           |                      |                |
| P07.21 | TODO   | main-agent |         |           |                      |                |
| P07.22 | TODO   | main-agent |         |           |                      |                |
| P07.23 | TODO   | main-agent |         |           |                      |                |
| P07.24 | TODO   | main-agent |         |           |                      |                |

## P08 — Agent Model 与 Pi Runtime Adapter

| ID     | Status | Owner      | Started | Completed | Verification command | Result / Notes |
| ------ | ------ | ---------- | ------- | --------- | -------------------- | -------------- |
| P08.01 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests | docs/upstream/PI_BASELINE.md; ADR-0004 amended (@earendil-works 0.85.1) |
| P08.02 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests | mdt-pi-runtime adapter; 6 tests green (mock StreamFn) |
| P08.03 | TODO   | main-agent |         |           |                      |                |
| P08.04 | TODO   | main-agent |         |           |                      |                |
| P08.05 | TODO   | main-agent |         |           |                      |                |
| P08.06 | TODO   | main-agent |         |           |                      |                |
| P08.07 | TODO   | main-agent |         |           |                      |                |
| P08.08 | TODO   | main-agent |         |           |                      |                |
| P08.09 | TODO   | main-agent |         |           |                      |                |
| P08.10 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests | RuntimeEvent union; stream-order test |
| P08.11 | TODO   | main-agent |         |           |                      |                |
| P08.12 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests | abort() -> cancelled (test) |
| P08.13 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests | normalizeError (test) |
| P08.14 | TODO   | main-agent |         |           |                      |                |

## P09 — Capability Registry 与内置工具

| ID     | Status | Owner      | Started | Completed | Verification command | Result / Notes |
| ------ | ------ | ---------- | ------- | --------- | -------------------- | -------------- |
| P09.01 | TODO   | main-agent |         |           |                      |                |
| P09.02 | TODO   | main-agent |         |           |                      |                |
| P09.03 | TODO   | main-agent |         |           |                      |                |
| P09.04 | TODO   | main-agent |         |           |                      |                |
| P09.05 | TODO   | main-agent |         |           |                      |                |
| P09.06 | TODO   | main-agent |         |           |                      |                |
| P09.07 | TODO   | main-agent |         |           |                      |                |
| P09.08 | TODO   | main-agent |         |           |                      |                |
| P09.09 | TODO   | main-agent |         |           |                      |                |
| P09.10 | TODO   | main-agent |         |           |                      |                |
| P09.11 | TODO   | main-agent |         |           |                      |                |
| P09.12 | TODO   | main-agent |         |           |                      |                |
| P09.13 | TODO   | main-agent |         |           |                      |                |
| P09.14 | TODO   | main-agent |         |           |                      |                |
| P09.15 | TODO   | main-agent |         |           |                      |                |
| P09.16 | TODO   | main-agent |         |           |                      |                |
| P09.17 | TODO   | main-agent |         |           |                      |                |
| P09.18 | TODO   | main-agent |         |           |                      |                |
| P09.19 | TODO   | main-agent |         |           |                      |                |
| P09.20 | TODO   | main-agent |         |           |                      |                |
| P09.21 | TODO   | main-agent |         |           |                      |                |
| P09.22 | TODO   | main-agent |         |           |                      |                |
| P09.23 | TODO   | main-agent |         |           |                      |                |
| P09.24 | TODO   | main-agent |         |           |                      |                |

## P10 — Codex Builder 集成

| ID     | Status | Owner      | Started | Completed | Verification command | Result / Notes |
| ------ | ------ | ---------- | ------- | --------- | -------------------- | -------------- |
| P10.01 | DONE   | main-agent | 2026-09-15 | 2026-09-15 | see commit history + tests | docs/upstream/CODEX_BASELINE.md; ADR-0005 |
| P10.02 | TODO   | main-agent |         |           |                      |                |
| P10.03 | TODO   | main-agent |         |           |                      |                |
| P10.04 | TODO   | main-agent |         |           |                      |                |
| P10.05 | TODO   | main-agent |         |           |                      |                |
| P10.06 | TODO   | main-agent |         |           |                      |                |
| P10.07 | TODO   | main-agent |         |           |                      |                |
| P10.08 | TODO   | main-agent |         |           |                      |                |
| P10.09 | TODO   | main-agent |         |           |                      |                |
| P10.10 | TODO   | main-agent |         |           |                      |                |
| P10.11 | TODO   | main-agent |         |           |                      |                |
| P10.12 | TODO   | main-agent |         |           |                      |                |
| P10.13 | TODO   | main-agent |         |           |                      |                |
| P10.14 | TODO   | main-agent |         |           |                      |                |
| P10.15 | TODO   | main-agent |         |           |                      |                |
| P10.16 | TODO   | main-agent |         |           |                      |                |
| P10.17 | TODO   | main-agent |         |           |                      |                |
| P10.18 | TODO   | main-agent |         |           |                      |                |
| P10.19 | TODO   | main-agent |         |           |                      |                |
| P10.20 | TODO   | main-agent |         |           |                      |                |

## P11 — Deterministic Generator / Compiler

| ID     | Status | Owner      | Started | Completed | Verification command | Result / Notes |
| ------ | ------ | ---------- | ------- | --------- | -------------------- | -------------- |
| P11.01 | TODO   | main-agent |         |           |                      |                |
| P11.02 | TODO   | main-agent |         |           |                      |                |
| P11.03 | TODO   | main-agent |         |           |                      |                |
| P11.04 | TODO   | main-agent |         |           |                      |                |
| P11.05 | TODO   | main-agent |         |           |                      |                |
| P11.06 | TODO   | main-agent |         |           |                      |                |
| P11.07 | TODO   | main-agent |         |           |                      |                |
| P11.08 | TODO   | main-agent |         |           |                      |                |
| P11.09 | TODO   | main-agent |         |           |                      |                |
| P11.10 | TODO   | main-agent |         |           |                      |                |
| P11.11 | TODO   | main-agent |         |           |                      |                |
| P11.12 | TODO   | main-agent |         |           |                      |                |
| P11.13 | TODO   | main-agent |         |           |                      |                |
| P11.14 | TODO   | main-agent |         |           |                      |                |
| P11.15 | TODO   | main-agent |         |           |                      |                |
| P11.16 | TODO   | main-agent |         |           |                      |                |
| P11.17 | TODO   | main-agent |         |           |                      |                |
| P11.18 | TODO   | main-agent |         |           |                      |                |
| P11.19 | TODO   | main-agent |         |           |                      |                |
| P11.20 | TODO   | main-agent |         |           |                      |                |
| P11.21 | TODO   | main-agent |         |           |                      |                |
| P11.22 | TODO   | main-agent |         |           |                      |                |

## P12 — Preview、真实运行与设计同步

| ID     | Status | Owner      | Started | Completed | Verification command | Result / Notes |
| ------ | ------ | ---------- | ------- | --------- | -------------------- | -------------- |
| P12.01 | TODO   | main-agent |         |           |                      |                |
| P12.02 | TODO   | main-agent |         |           |                      |                |
| P12.03 | TODO   | main-agent |         |           |                      |                |
| P12.04 | TODO   | main-agent |         |           |                      |                |
| P12.05 | TODO   | main-agent |         |           |                      |                |
| P12.06 | TODO   | main-agent |         |           |                      |                |
| P12.07 | TODO   | main-agent |         |           |                      |                |
| P12.08 | TODO   | main-agent |         |           |                      |                |
| P12.09 | TODO   | main-agent |         |           |                      |                |
| P12.10 | TODO   | main-agent |         |           |                      |                |
| P12.11 | TODO   | main-agent |         |           |                      |                |
| P12.12 | TODO   | main-agent |         |           |                      |                |

## P13 — 安全模型与权限边界

| ID     | Status | Owner      | Started | Completed | Verification command | Result / Notes |
| ------ | ------ | ---------- | ------- | --------- | -------------------- | -------------- |
| P13.01 | TODO   | main-agent |         |           |                      |                |
| P13.02 | TODO   | main-agent |         |           |                      |                |
| P13.03 | TODO   | main-agent |         |           |                      |                |
| P13.04 | TODO   | main-agent |         |           |                      |                |
| P13.05 | TODO   | main-agent |         |           |                      |                |
| P13.06 | TODO   | main-agent |         |           |                      |                |
| P13.07 | TODO   | main-agent |         |           |                      |                |
| P13.08 | TODO   | main-agent |         |           |                      |                |
| P13.09 | TODO   | main-agent |         |           |                      |                |
| P13.10 | TODO   | main-agent |         |           |                      |                |
| P13.11 | TODO   | main-agent |         |           |                      |                |
| P13.12 | TODO   | main-agent |         |           |                      |                |
| P13.13 | TODO   | main-agent |         |           |                      |                |
| P13.14 | TODO   | main-agent |         |           |                      |                |

## P14 — 自动化测试体系

| ID     | Status | Owner      | Started | Completed | Verification command | Result / Notes |
| ------ | ------ | ---------- | ------- | --------- | -------------------- | -------------- |
| P14.01 | TODO   | main-agent |         |           |                      |                |
| P14.02 | TODO   | main-agent |         |           |                      |                |
| P14.03 | TODO   | main-agent |         |           |                      |                |
| P14.04 | TODO   | main-agent |         |           |                      |                |
| P14.05 | TODO   | main-agent |         |           |                      |                |
| P14.06 | TODO   | main-agent |         |           |                      |                |
| P14.07 | TODO   | main-agent |         |           |                      |                |
| P14.08 | TODO   | main-agent |         |           |                      |                |
| P14.09 | TODO   | main-agent |         |           |                      |                |
| P14.10 | TODO   | main-agent |         |           |                      |                |
| P14.11 | TODO   | main-agent |         |           |                      |                |
| P14.12 | TODO   | main-agent |         |           |                      |                |
| P14.13 | TODO   | main-agent |         |           |                      |                |
| P14.14 | TODO   | main-agent |         |           |                      |                |
| P14.15 | TODO   | main-agent |         |           |                      |                |
| P14.16 | TODO   | main-agent |         |           |                      |                |
| P14.17 | TODO   | main-agent |         |           |                      |                |
| P14.18 | TODO   | main-agent |         |           |                      |                |
| P14.19 | TODO   | main-agent |         |           |                      |                |
| P14.20 | TODO   | main-agent |         |           |                      |                |
| P14.21 | TODO   | main-agent |         |           |                      |                |
| P14.22 | TODO   | main-agent |         |           |                      |                |
| P14.23 | TODO   | main-agent |         |           |                      |                |
| P14.24 | TODO   | main-agent |         |           |                      |                |
| P14.25 | TODO   | main-agent |         |           |                      |                |

## P15 — 性能、可靠性与可观测性

| ID     | Status | Owner      | Started | Completed | Verification command | Result / Notes |
| ------ | ------ | ---------- | ------- | --------- | -------------------- | -------------- |
| P15.01 | TODO   | main-agent |         |           |                      |                |
| P15.02 | TODO   | main-agent |         |           |                      |                |
| P15.03 | TODO   | main-agent |         |           |                      |                |
| P15.04 | TODO   | main-agent |         |           |                      |                |
| P15.05 | TODO   | main-agent |         |           |                      |                |
| P15.06 | TODO   | main-agent |         |           |                      |                |
| P15.07 | TODO   | main-agent |         |           |                      |                |
| P15.08 | TODO   | main-agent |         |           |                      |                |
| P15.09 | TODO   | main-agent |         |           |                      |                |
| P15.10 | TODO   | main-agent |         |           |                      |                |
| P15.11 | TODO   | main-agent |         |           |                      |                |
| P15.12 | TODO   | main-agent |         |           |                      |                |

## P16 — CI/CD、构建与桌面分发

| ID     | Status | Owner      | Started | Completed | Verification command | Result / Notes |
| ------ | ------ | ---------- | ------- | --------- | -------------------- | -------------- |
| P16.01 | TODO   | main-agent |         |           |                      |                |
| P16.02 | TODO   | main-agent |         |           |                      |                |
| P16.03 | TODO   | main-agent |         |           |                      |                |
| P16.04 | TODO   | main-agent |         |           |                      |                |
| P16.05 | TODO   | main-agent |         |           |                      |                |
| P16.06 | TODO   | main-agent |         |           |                      |                |
| P16.07 | TODO   | main-agent |         |           |                      |                |
| P16.08 | TODO   | main-agent |         |           |                      |                |
| P16.09 | TODO   | main-agent |         |           |                      |                |
| P16.10 | TODO   | main-agent |         |           |                      |                |
| P16.11 | TODO   | main-agent |         |           |                      |                |
| P16.12 | TODO   | main-agent |         |           |                      |                |

## P17 — 文档、示例项目与开发者体验

| ID     | Status | Owner      | Started | Completed | Verification command | Result / Notes |
| ------ | ------ | ---------- | ------- | --------- | -------------------- | -------------- |
| P17.01 | TODO   | main-agent |         |           |                      |                |
| P17.02 | TODO   | main-agent |         |           |                      |                |
| P17.03 | TODO   | main-agent |         |           |                      |                |
| P17.04 | TODO   | main-agent |         |           |                      |                |
| P17.05 | TODO   | main-agent |         |           |                      |                |
| P17.06 | TODO   | main-agent |         |           |                      |                |
| P17.07 | TODO   | main-agent |         |           |                      |                |
| P17.08 | TODO   | main-agent |         |           |                      |                |
| P17.09 | TODO   | main-agent |         |           |                      |                |
| P17.10 | TODO   | main-agent |         |           |                      |                |
| P17.11 | TODO   | main-agent |         |           |                      |                |
| P17.12 | TODO   | main-agent |         |           |                      |                |
| P17.13 | TODO   | main-agent |         |           |                      |                |
| P17.14 | TODO   | main-agent |         |           |                      |                |

## P18 — 1.0 总体验收与冻结

| ID     | Status | Owner      | Started | Completed | Verification command | Result / Notes |
| ------ | ------ | ---------- | ------- | --------- | -------------------- | -------------- |
| P18.01 | TODO   | main-agent |         |           |                      |                |
| P18.02 | TODO   | main-agent |         |           |                      |                |
| P18.03 | TODO   | main-agent |         |           |                      |                |
| P18.04 | TODO   | main-agent |         |           |                      |                |
| P18.05 | TODO   | main-agent |         |           |                      |                |
| P18.06 | TODO   | main-agent |         |           |                      |                |
| P18.07 | TODO   | main-agent |         |           |                      |                |
| P18.08 | TODO   | main-agent |         |           |                      |                |
| P18.09 | TODO   | main-agent |         |           |                      |                |
| P18.10 | TODO   | main-agent |         |           |                      |                |
| P18.11 | TODO   | main-agent |         |           |                      |                |
| P18.12 | TODO   | main-agent |         |           |                      |                |
| P18.13 | TODO   | main-agent |         |           |                      |                |
| P18.14 | TODO   | main-agent |         |           |                      |                |
| P18.15 | TODO   | main-agent |         |           |                      |                |
| P18.16 | TODO   | main-agent |         |           |                      |                |
| P18.17 | TODO   | main-agent |         |           |                      |                |
| P18.18 | TODO   | main-agent |         |           |                      |                |
| P18.19 | TODO   | main-agent |         |           |                      |                |
| P18.20 | TODO   | main-agent |         |           |                      |                |

---

Total tasks: 310
