# MDT 1.0 Release Checklist

Every line needs evidence (command + output) recorded next to it or linked
from `MDT_1.0_ACCEPTANCE_REPORT.md`. Release is blocked while any box is
unchecked.

## Repository & legal

- [x] `origin` = TZUKWAN/metis-development-tool, PUBLIC
- [x] `genoffice-upstream` fetch-only (invalid push URL + pre-push hook; simulated push fails)
- [x] No PRs/branches pushed to GenOffice (`git log --all` contains only MDT history)
- [x] LICENSE (Apache-2.0), NOTICE, THIRD_PARTY_NOTICES.md complete
- [x] GenOffice baseline SHA recorded (docs/upstream/GENOFFICE_BASELINE.md)
- [ ] Dependency license scan green on release commit (`npm run licenses`)

## Quality gates (on the release commit)

- [ ] `npm run format:check`
- [ ] `npm run lint`
- [ ] `npm run typecheck` (kept workspaces)
- [ ] `npm run typecheck:mdt`
- [ ] `npm test` (packages)
- [ ] `npm run test:mdt` (app, 574+ green)
- [ ] Coverage thresholds per package (vitest coverage, no threshold errors)
- [ ] Playwright E2E: `e2e/mdt` smoke + generated-app suites
- [ ] `npm audit --audit-level=critical` triaged (no unhandled critical)

## Samples (three from-zero builds, P18.07)

- [ ] fixtures/samples/web-research-agent → build + run
- [ ] fixtures/samples/file-analyst → build + run
- [ ] fixtures/samples/planner-and-research → build + run

## Real-runtime acceptance

- [x] Real Pi turn (P18.09): docs/testing/live-provider.md
- [x] Real Codex build (P18.08): docs/testing/real-codex-run.md
- [x] Standalone generated app (P18.11): outside-repo install/build/test PASS

## Security review (P18.12)

- [x] SSRF guard tests (capabilities suite)
- [x] Path sandbox / symlink tests
- [x] XSS tests (designer CodeBlock, emitted app)
- [x] Secret redaction tests (logs, capability outputs)
- [x] Shell/python spawn discipline tests (shell:false, env allowlist)
- [x] Codex workspace boundary (sandbox flags pinned in builder)
- [ ] Final security sweep pass recorded

## Packaging (P16)

- [ ] Windows artifact built from release tag and smoke-launched
- [ ] macOS artifact built from release tag
- [ ] Linux artifact built from release tag
- [ ] Checksums + SBOM attached to the release
- [ ] Version injected consistently (package/app/about, P16.05)

## Freeze

- [ ] schemaVersion frozen at 1 (migration policy in docs)
- [ ] CHANGELOG finalized
- [ ] TASK_STATUS.md all rows reconciled
- [ ] P0/P1 issue count = 0 (issue triage, P18.16)
