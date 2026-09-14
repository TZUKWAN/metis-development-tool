# Contributing to Metis Development Tool (MDT)

Thanks for your interest in contributing to MDT. This document covers local
setup, repository policy, and the quality bar every change must meet.

## Upstream policy (read first — hard rules)

MDT vendors code from [GenOffice](https://github.com/genspark-ai/genoffice)
(Apache-2.0, © Mainfunc, Inc.) at a fixed baseline (see
`docs/upstream/GENOFFICE_BASELINE.md`).

**You must never:**

- ❌ push any branch, commit or tag to `genoffice-upstream` (it is
  configured fetch-only; its push URL is invalid and a `pre-push` hook
  blocks any `genoffice`/`genspark` target — do not "fix" this),
- ❌ open a pull request against `genspark-ai/genoffice` from MDT,
- ❌ merge upstream `main` wholesale over MDT (cherry-pick only — see
  `docs/upstream/UPDATE_GENOFFICE.md`),
- ❌ remove or weaken GenOffice Apache-2.0 attribution in derived files,
  `NOTICE`, or `THIRD_PARTY_NOTICES.md`.

All commits, branches, PRs, tags and releases belong exclusively to this
repository (`origin` = `TZUKWAN/metis-development-tool`).

## Local setup

```sh
git clone https://github.com/TZUKWAN/metis-development-tool.git
cd metis-development-tool
npm ci
npm run dev:mdt
```

- Node ≥ 22.12, npm ≥ 10 (`.nvmrc`: 22).
- Windows/macOS/Linux are all first-class; do not break any of them.
- Optional: `codex` CLI for exercising the real Build flow
  (`codex login status` to check auth). Never commit credentials.

## Repository layout

- `apps/mdt` — the MDT Electron app (main / preload / renderer).
- `packages/*` — workspace packages. MDT-owned packages are prefixed
  `mdt-` (`mdt-schema`, `mdt-project`, `mdt-design`, `mdt-interactions`,
  `mdt-capabilities`, `mdt-pi-runtime`, `mdt-codex`, `mdt-generator`,
  `mdt-preview`, `mdt-testing`, `ui`, …). GenOffice-derived engine packages
  (`pptx-engine`, `pptx-render`, `font-metrics`, `i18n`, `project-store`,
  `electron-utils`, `file-parse`) keep their upstream names.
- `templates/web-agent` — the generated-app scaffold.
- `e2e/`, `fixtures/`, `docs/`, `scripts/`, `.github/workflows/`.

## Commit conventions

Conventional Commits (`feat:`, `fix:`, `refactor:`, `test:`, `docs:`,
`chore:`, `perf:`, `build:`, `ci:`), small and logically coherent. One
commit must not mix unrelated formatting, dependency upgrades and feature
changes.

## Quality bar (every PR)

- `npm run format:check`
- `npm run lint`
- `npm run typecheck:mdt` (TypeScript strict; no new `any`/`@ts-ignore`/
  empty-catch/ESLint-disable "fixes")
- `npm run test:mdt` (unit + integration; coverage floors for `mdt-*`
  packages: schema ≥90%, project/interactions/capabilities/generator ≥85%,
  codex/pi-runtime ≥80% — no assertion-free coverage stuffing)
- Relevant Playwright E2E for UI changes; visual baselines update only with
  explicit review
- New architecture decisions need an ADR (`docs/adr/README.md`)

## Tests and failure policy

- A failing test is a bug: find the root cause. Do not skip tests, lower
  assertions, inflate timeouts, delete features or widen tolerance to make
  CI green.
- Two failed fix attempts on the same failure → write up the investigation
  in `docs/debug/<topic>.md` and re-read the affected code paths before the
  third attempt.
- Data corruption, permission escape or security findings are P0/P1: fix
  before new feature work, and land a regression test with the fix.

## Branch protection

`main` requires the CI workflow to pass before merge (GitHub branch
protection when permissions allow, otherwise enforced by review policy —
see `docs/adr/` release-management notes). Force-push to `main` is
forbidden.
