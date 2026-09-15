# Release Notes — Metis Development Tool v1.0.0

**2026-09-15** · First stable release · Apache-2.0

## What works end to end (verified)

The complete main flow from MDT_1.0_TASKLIST §4.2: create project → design
pages (PowerPoint-style, GenOffice Slides engine) → wire interactions on
the infinite canvas → design agents with capabilities → **Build** (Codex
implements the blueprint behind real quality gates) → run the generated
app (Pi Agent Core streams real model responses) → export standalone
source that builds and runs without MDT.

## Highlights

- **Designer**: vendored GenOffice Slides engine (text/shapes/images/
  tables/charts, undo/redo, groups, thumbnails), MDT semantics overlay
  with durable element identity, Agents/Interactions/Semantics/Build dock.
- **Interaction Canvas** (React Flow): page/agent nodes, connection
  popover (navigate/modal/drawer/send-to-agent), edge inspector, lint
  (dangling refs, type mismatches, load-cycles, missing args).
- **13 built-in capabilities** with a security-first runtime: SSRF-guarded
  web fetch/search/HTTP, sandboxed file tools, default-denied
  shell/python/MCP, safe datetime/json, cancellable ask_user.
- **Codex Builder**: app-server integration, isolated build branches,
  quality gates (install → vite build → vitest) with a bounded repair
  loop, apply/rollback via known-good tags, redacted JSONL build logs.
- **Generator**: deterministic byte-stable emission, patch boundary
  (regeneration preserves user code), `.mdt-map.json` design↔source map.
- **Generated apps**: standalone Vite+React+Node projects running
  `@earendil-works/pi-agent-core`; zero MDT/Codex dependencies (CI
  asserted); 3 sample projects included.

## Verification

- 2,868 package tests + 574 app tests + 5 E2E specs — **0 failures**
  after clean install (P18.01–P18.05)
- Coverage gates enforced per package (schema 95.9/83.1, project 99.5/89.7,
  codex 98.7/89.2, pi-runtime 94.7/89.2, capabilities 88.3/81.9 …)
- Real-runtime acceptance: live Pi turn (Qwen3.6-35B-A3B endpoint, 3,580
  streamed events) and real Codex build — both PASS with evidence in
  `docs/testing/`
- Standalone acceptance: generated app copied outside the repo installs,
  builds and passes its tests with zero MDT dependencies
- axe accessibility scan of the main flow: 0 serious/critical violations

## Known limitations

P0 = 0, P1 = 0. Documented P2/P3 deferrals in
[docs/release/KNOWN_ISSUES.md](docs/release/KNOWN_ISSUES.md): interaction
canvas uses placeholder cards (not live thumbnails); browser/MCP
capabilities in generated apps are named extension points; unsigned
release artifacts. Remaining roadmap items (designer insert-presets for
MDT UI controls, approval UI bridge, large-project/long-run stress
specs) are tracked in ROADMAP.md and TASK_STATUS.md.

## Upgrade / install

See [README](README.md) quick start and [SECURITY](SECURITY.md) for the
threat model and unsigned-artifact notes.
