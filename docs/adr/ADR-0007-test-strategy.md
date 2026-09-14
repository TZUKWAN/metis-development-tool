# ADR-0007: Test strategy — Vitest + Playwright + fake-Codex CI gate

- Status: Accepted
- Date: 2026-09-15
- Deciders: MDT main agent

## Context

Tasklist P14 defines a layered test matrix with hard gates (coverage floors
per core package, E2E stability 10/10, no real network/credentials in CI).
MDT is an Electron app plus ~14 workspace packages plus generated apps —
tests must be fast, hermetic, and deterministic where possible.

## Decision

- **Unit/integration**: Vitest workspaces, one config per package, unified
  coverage thresholds (mdt-schema ≥90%, mdt-project/interactions/
  capabilities/generator ≥85%, mdt-codex/pi-runtime ≥80% lines).
- **E2E**: Playwright driving the packaged/dev Electron app (xDot-style
  driver via `_electron`), plus browser-mode E2E for generated apps served
  by Vite preview.
- **Codex in CI**: a deterministic **fake Codex client** simulates sessions,
  file edits, failures and repair loops; real-Codex smoke tests are
  workflow_dispatch-gated (P14.16) because CI has no ChatGPT login.
- **Pi in CI**: a scripted mock provider (Pi supports custom
  OpenAI-compatible endpoints; tests inject a local mock server). Real
  provider acceptance runs locally (P18.09) with the user's endpoint, never
  in public CI.
- **Visual regression**: Playwright screenshots of Designer/Interaction/
  Preview with reviewed baselines only (P14.18).
- **Flake gate**: critical E2E run 10× in a dedicated workflow before
  release (P14.25).

## Alternatives

- _Jest_: slower TS/ESM story in this monorepo; upstream already uses
  Vitest — reuse it.
- _Real Codex in every CI run_: non-hermetic, costs money, needs secrets in
  CI — rejected.
- _Only unit tests_: violates tasklist P14/P18 gates — not an option.

## Consequences

- Every package ships `test`/`typecheck` scripts wired into root
  orchestration and CI.
- No `test.skip`/lowered assertions to force green (P00.03); flaky tests are
  fixed, not quarantined silently.
- Coverage reports are published per CI run; regressions below thresholds
  fail the build.
