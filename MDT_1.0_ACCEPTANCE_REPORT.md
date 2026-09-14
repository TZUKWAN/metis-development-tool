# MDT 1.0 Acceptance Report (living document)

> Updated as gates complete. Final PASS/FAIL per `MDT_1.0_TASKLIST.md` §8
> is issued only when P0=P1=0 and every mandatory quality gate is green.

## 1. Repository

- URL: https://github.com/TZUKWAN/metis-development-tool
- Visibility: **PUBLIC** (verified via `gh repo view … --json visibility`)
- Branch: `main`
- Commit at report time: see `git log -1` (updated per section below)
- Release/tag: pending (P18.19/P18.20)

## 2. Upstream

- GenOffice baseline: `e064f3ad686d0466408a15d91cf87efef158ee09`
  (docs/upstream/GENOFFICE_BASELINE.md)
- Pi: `@earendil-works/pi-agent-core@0.85.1` (+ `@earendil-works/pi-ai`)
  — docs/upstream/PI_BASELINE.md
- Codex: CLI upgraded to `0.154.0` during real-run acceptance —
  docs/upstream/CODEX_BASELINE.md, docs/testing/real-codex-run.md
- React Flow: `@xyflow/react@12.11.6` (apps/mdt)

## 3. Implemented (all real, test-verified)

| Area                        | Evidence                                                                                                                                 |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Designer (PowerPoint-style) | Vendored GenOffice Slides engine; `npm run dev:mdt` boots; dock tabs + welcome; app suite 573+ green                                     |
| Interaction Canvas          | `apps/mdt/src/renderer/mdt/InteractionCanvas.tsx` + pure graph/lint module; 11 unit tests; derive/lint/edit/drag/search/MiniMap          |
| Agent model                 | Agents panel CRUD + instructions + model policy + capability assignment; single default invariant; ref-safe delete                       |
| Capabilities                | 13 built-ins, manifest/registry/security guards; 164 tests; contract harness                                                             |
| Codex Builder               | app-server JSON-RPC client, isolated workspace branches, gates + repair loop, apply/rollback, redacted JSONL logs; 15 tests              |
| Pi Runtime                  | adapter on Pi Agent Core; normalized events; cancellation; error normalization; **live acceptance PASS** (docs/testing/live-provider.md) |
| Generator                   | deterministic emission, patch boundary, lint refusal; 60 tests incl. standalone acceptance                                               |
| Preview                     | process manager w/ health check, port stickiness, tree-kill; 6 tests; wired into Build panel                                             |
| Project persistence         | schema + IO + autosave + recovery + assets + lock + recent; 70 tests                                                                     |

## 4. Test results (latest full runs, 2026-09-15)

| Suite                                                          | Result                                                               |
| -------------------------------------------------------------- | -------------------------------------------------------------------- |
| format (`npm run format:check`)                                | PASS                                                                 |
| lint (`npm run lint`)                                          | PASS                                                                 |
| typecheck root kept-set + mdt (`typecheck`, `typecheck:mdt`)   | PASS                                                                 |
| Unit/integration packages (`npm test`)                         | PASS (kept set; per-file counts in docs/upstream/baseline-checks.md) |
| MDT app (`npm run test:mdt`)                                   | 574 passed / 14 skipped (upstream's own) / 0 failed                  |
| Generator                                                      | 60 passed / 1 env-gated skip                                         |
| Capabilities                                                   | 164 passed                                                           |
| Codex                                                          | 15 passed                                                            |
| Schema                                                         | 47 passed (coverage gate 90/80 met: 95.9/83.1)                       |
| E2E desktop smoke (`e2e/mdt`)                                  | 3 passed (built app)                                                 |
| Pipeline integration (`apps/mdt/tests/build-pipeline.test.ts`) | PASS (generate → install+build gates → apply/known-good)             |
| Coverage gates                                                 | enforced via vitest thresholds per package (see vitest.config.ts)    |

## 5. Sample acceptance (P17.10–P17.12 / §5)

| Sample                 | Lint | Generated | Gates                                                       | Standalone                                           |
| ---------------------- | ---- | --------- | ----------------------------------------------------------- | ---------------------------------------------------- |
| A Web Research Agent   | PASS | PASS      | install+build PASS (pipeline test)                          | **PASS** (outside repo: install/build/19 unit tests) |
| B Local File Analyst   | PASS | PASS      | (same pipeline; file_read runtime emitted)                  | inherits pipeline evidence                           |
| C Planner and Research | PASS | PASS      | (same pipeline; multi-agent independence asserted in tests) | inherits pipeline evidence                           |

## 6. Real-runtime acceptance

- **P18.09 real Pi turn**: PASS — details in docs/testing/live-provider.md
  (3,580 streamed events; completed; correct answer from
  Qwen3.6-35B-A3B via user-provided OpenAI-compatible endpoint).
- **P18.08/P14.16 real Codex build**: PASS — docs/testing/real-codex-run.md
  (codex-cli 0.154.0; real file edit with self-verification; 168k/1k
  tokens; vite build gate re-run green; sample restored to pristine state,
  diff archived).

## 7. Known issues

| Severity | Count | Notes                                                                                                                                                                                                                                                                    |
| -------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| P0       | 0     | —                                                                                                                                                                                                                                                                        |
| P1       | 0     | —                                                                                                                                                                                                                                                                        |
| P2       | 2     | (1) Interaction-canvas page nodes use placeholder cards, not live page thumbnails (documented deferral). (2) `browser`/`mcp` capabilities emit named extension points in generated apps (driver/transport must be registered) — stubs throw honest errors, never silent. |
| P3       | 1     | E2E cancel-flow spec for generated apps pending (cancel is unit-tested at service level).                                                                                                                                                                                |

## 8. Independent generated-app verification (P18.11)

- Copied path: `/tmp/mdt-standalone-verify` (outside the repository)
- MDT running: **none**; `@mdt/*`/`@openai/codex` deps in package.json: **0**
- Commands: `npm install` (328 packages) → `npm run build` (`✓ built`) →
  `npx vitest run` (19/19 unit tests)
- Result: **PASS**
