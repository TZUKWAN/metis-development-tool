# MDT Performance Baseline (P15.01, P02.10)

Measured on the dev machine (Windows x64, Node v25.6.0) against the BUILT
app (apps/mdt/out). Update this file whenever a change regresses these
numbers materially; CI tracks suite durations implicitly.

## App cold start (electron.launch → first window DOM ready + #root mounted)

| Run    | ms         |
| ------ | ---------- |
| 1      | 738        |
| 2      | 741        |
| 3      | 747        |
| median | **741 ms** |

Method: `e2e/mdt/cold-start.spec.mts` (3 sequential launches, in-repo
artifact: e2e/mdt/cold-start.json). No ordering-of-magnitude regression
vs the vendored GenOffice Slides standalone boot is permitted (P15.01).

## Renderer canvas

- GenOffice Slides engine baseline retained: per-slide pixel-ratio
  adaptation above 300 nodes (DENSE_SLIDE_NODE_COUNT) and settled-zoom
  debounce are inherited unchanged (docs/architecture/slides-renderer-map.md).
- Interaction Canvas: node/edge derivation is memoized per store change;
  node components are React.memo'd (P07.23); position writes do not mark
  the document dirty.

## Build pipeline (P10.20)

Pipeline integration test (generate → install → vite build → apply):
~13 s wall clock for the three-page sample (warm npm cache); npm install
dominates (9 s). Vite production build of a generated app: ~0.6–0.8 s.

## Test suites (CI cost signal)

| Suite                                            | Duration                                                           |
| ------------------------------------------------ | ------------------------------------------------------------------ |
| @mdt/schema (47 tests)                           | ~1 s                                                               |
| @mdt/project (23)                                | ~2 s                                                               |
| @mdt/codex (15)                                  | ~2 s                                                               |
| @mdt/pi-runtime (6)                              | ~1 s                                                               |
| apps/mdt unit (574)                              | ~10 s                                                              |
| @mdt/capabilities (164)                          | ~30 s                                                              |
| @mdt/generator (61, incl. standalone acceptance) | ~10 min (npm install dominates; opt-out via MDT_SKIP_STANDALONE=1) |

## Packaging artifact smoke (P16.12, Windows)

- `npm run dist:win` → `apps/mdt/release/Metis Development Tool Setup 0.1.0.exe`
  (NSIS) + `win-unpacked/` — DIST_EXIT=0.
- Smoke: `win-unpacked/Metis Development Tool.exe` launched, renderer
  process alive at 12 s (178 MB), then terminated. Recorded 2026-09-15.
- First attempt hit a transient Windows EPERM on the electron-unpack
  rename (antivirus/lock class); clean retry succeeded — CI packaging
  jobs run on clean runners, where this has not been observed.
