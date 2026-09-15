# Known Issues at Release Candidate (P18.16 triage)

Severity policy: P0 blocker / P1 critical / P2 workaround or documented
deferral not affecting the main flow / P3 polish.

## P0 — none

## P1 — none

## P2

| ID | Issue | Workaround / rationale |
| --- | --- | --- |
| P2-1 | Interaction-canvas page nodes render a colored placeholder card instead of a live page thumbnail. | Real thumbnails are wired to the deck offscreen renderer in the 1.1 roadmap; type badge + element count + name are shown. Main flow (connect/edit) unaffected. |
| P2-2 | Generated apps: `browser` and `mcp` capabilities emit explicit extension points (driver / MCP transport must be registered server-side); unregistered calls throw a named, actionable error. | These capabilities require heavyweight per-app integrations (Playwright driver, MCP transport). All other nine capabilities ship fully self-contained. |
| P2-3 | Node ≥ 23's built-in `localStorage` global shadows jsdom's Storage inside vitest (partial API). Affected renderer tests stub it in `beforeAll`. | Test-environment-only; documented in the affected test. |
| P2-4 | Release artifacts are unsigned. | Standard for OSS distribution at 1.0; OS warnings documented in SECURITY.md and the README release notes. |

## P3

| ID | Issue |
| --- | --- |
| P3-1 | Generated-app E2E covers the happy chat path with mocked SSE; a dedicated cancel-flow spec is pending (cancel itself is unit-tested at the service level). |
| P3-2 | `componentRef` instance expansion in the generator renders instances as grouped containers; override semantics persist in the project model but visual inlining lands with the component roadmap item. |

## Resolved during the cycle (for the record)

- GenOffice Windows baseline defects (prettier spawn EINVAL, xmllint CRLF
  filtering, libxml parser-warning noise, POSIX path assumptions) — fixed
  upstream-style in-repo; see docs/upstream/baseline-checks.md.
- RecentProjects case-insensitive identity on win32 — fixed with tests.
- Codex CLI 0.144.1 rejected by account default model — CLI upgraded to
  0.154.0 during real-run acceptance; version-range check updated.

## Dependency audit note (P13.11)

`npm audit --audit-level=critical`: **0 critical**; 2 high advisories exist
in `image-size` (DoS in ICNS/JXL/HEIF parsers), reached only through
`pptxgenjs` — a **devDependency used solely by pptx-engine fixture
generation scripts**. It is not bundled in the MDT app, not shipped in
generated apps, and processes only locally authored test fixtures. The
advisory's fix path requires downgrading pptxgenjs to 2.2.0 (breaking the
fixture toolchain); tracked for the next dependency pass.
