# GenOffice Baseline Checks (baseline `e064f3a` on Windows x64, Node v25.6.0)

> Recorded 2026-09-15 during MDT task P02.02–P02.04. These establish the
> upstream baseline before any MDT modification, so regressions can be
> attributed correctly.

## Install (P02.01)

- `npm ci` — **PASS** (exit 0). Electron 43.3.0 binary downloaded via the
  repo's `install-electron` postinstall. npm reports upstream audit
  advisories (typical for a large dependency tree); MDT tracks these under
  P13.11/CI. Lockfile untouched.

## format:check (P02.02)

- First run: **FAIL (upstream tooling bug on Windows)** —
  `tools/format-changed.mjs` used `spawnSync(prettier.cmd, …)` without
  `shell`; Node ≥ 18.20 returns `EINVAL` when spawning `.cmd` shims
  directly on win32. This is an upstream tool defect, not a formatting
  failure.
- **Fix applied by MDT**: `tools/format-changed.mjs` now passes
  `shell: process.platform === 'win32'` (see commit "fix(tools): make
  format-changed spawn prettier correctly on Windows").
- After fix: **PASS** — `All matched files use Prettier code style!`

## typecheck (P02.03)

- `npm run typecheck` (all 24 workspaces chained) — **PASS** (exit 0) on
  the pristine baseline. Slides workspace (`@genoffice/slides`, `tsc
--noEmit`) included.

## unit/integration tests (P02.04)

- `npm test` (chained per-workspace vitest).
- Pristine baseline on Windows: **1 failing workspace** —
  `@genoffice/electron-utils`, 5 of 163 tests, all POSIX-platform
  assumptions in test expectations (not production bugs):
  1. `renderer-scheme.test.ts` ×2 — expected literal `'/out/...'` POSIX
     absolute paths; `path.resolve` on win32 yields drive-absolute paths.
  2. `dialog-memory.test.ts` ×2 — expected literal `'/work'`; `dirname()`
     of a `join()`-built path is `\work` on win32.
  3. `default-save-dir.test.ts` ×1 — chmod-based "unwritable directory"
     simulation has no Windows equivalent (NTFS ACLs ignore POSIX modes for
     the current user).
- **Fixes applied by MDT** (commit "test(electron-utils): platform-neutral
  expectations"): path expectations built via `resolve()`/`join()`; the
  chmod test is `it.skipIf(process.platform === 'win32')` with the platform
  reason documented in the test — behavior remains covered on POSIX CI.
  No production code was weakened.
- After fixes: `@genoffice/electron-utils` **162 passed, 1 skipped
  (documented)**.

### Per-workspace baseline results (Windows, after MDT environment fixes)

| Workspace       | Result                               | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| --------------- | ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| i18n            | 18 passed                            |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| electron-utils  | 162 passed, 1 skipped                | platform-neutral expectation fix                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| docx-engine     | 1321 passed, 1 skipped               |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| pdf2docx        | 744 passed, 7 skipped                | upstream's own skips                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| html2docx       | 66 passed (with `CHROME_PATH` set)   | upstream candidate list lacks Windows Chrome paths; env var is the documented mechanism. 66 tests skip without Chrome.                                                                                                                                                                                                                                                                                                                                                                                          |
| file-parse      | 30 passed                            |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| **pptx-engine** | **957 passed, 1 skipped**            | 2 upstream Windows bugs fixed by MDT: (a) xmllint CRLF output defeated the ` validates$` summary filter (`tools/ooxml-validate/validate-pptx.mjs` now splits `/\r?\n/`); (b) libxml ≥ 2.12 emits non-fatal `Schemas parser warning` lines (duplicate schema imports) that were parsed as part failures (now filtered; real parser errors still fail).                                                                                                                                                           |
| pptx-render     | 271 passed                           |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| pipelines       | 31 passed                            |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ai-search       | 50 passed, 1 failed                  | `genoffice-auth.test.ts` expects POSIX `statSync().mode & 0o777 === 0o600` — impossible on Windows. Package scheduled for removal with the GenOffice AI panel (P03.05, see `docs/architecture/ai-deps-removal-plan.md`); removal supersedes a fix.                                                                                                                                                                                                                                                              |
| agent-core      | 87 passed                            | removed with AI panel (P03.05)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ai-provider     | 220 passed                           | removed with AI panel (P03.05)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| project-store   | 62 passed                            |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| cli             | 115 passed, 5 failed, 12 skipped     | Windows assumptions (`/apps\/shell$/` regex, chmod-based writability, Electron headless-launch timing, exit-code env diff). Package scheduled for removal (P03.03) — zero consumers from the Slides closure.                                                                                                                                                                                                                                                                                                    |
| ui              | 5 passed                             |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| **slides**      | **729 passed, 1 failed, 14 skipped** | The single failing test + 3 failing files all trace to one root cause: `AiPanel.tsx:368` calls `localStorage.removeItem` at module scope, and Node ≥ 23's built-in `localStorage` global (partial API, no `removeItem`) shadows jsdom's inside vitest. 3 of the 4 files are AI-panel tests; the 4th (`stage-refit-follow.test.ts`) fails only via `App.tsx` importing `AiPanel`. All four are scheduled for elimination by the P03.05 AI-panel removal; verified green after removal (see P03.05 verification). |

## Notes for regression triage

Any MDT-era failure in the above areas must first be compared against this
document: if the pristine baseline exhibits it, it is an upstream baseline
condition, not an MDT regression — but it still must be fixed (not
documented away) before 1.0, per the MDT quality gates — unless the affected
code is removed by an evidenced MDT decision (removal plan +
`docs/architecture/ai-deps-removal-plan.md`).
