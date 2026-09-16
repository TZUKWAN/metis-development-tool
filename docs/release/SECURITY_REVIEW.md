# MDT 1.0 Security Review Final Sweep (P18.12)

> Completed 2026-09-16 as part of the V2 audit remediation.

## Test-verified security controls

| Control | Test evidence | Status |
| --- | --- | --- |
| SSRF guard (scheme allowlist, private/metadata block, per-redirect revalidation) | `packages/mdt-capabilities/tests/web-fetch.test.ts`, `http-request.test.ts` | ✅ PASS |
| Path sandbox (canonicalize + containment + symlink escape) | `packages/mdt-capabilities/tests/file-tools.test.ts`, `packages/mdt-project/tests/layout.test.ts` | ✅ PASS |
| Command injection (shell:false, args arrays, env allowlist) | `packages/mdt-capabilities/tests/shell-python.test.ts` | ✅ PASS |
| XSS (text extraction strips scripts, no innerHTML/eval) | generator golden tests + emitted capability modules | ✅ PASS |
| Secret redaction (log sanitizer, capability output checks) | `packages/mdt-codex/tests/codex.test.ts`, capabilities contract tests | ✅ PASS |
| Codex workspace isolation (branch + sandbox + cwd pinning) | `packages/mdt-codex/tests/build-workspace-branches.test.ts` | ✅ PASS |
| Electron isolation (contextIsolation, sandbox, no nodeIntegration) | inherited from GenOffice + verified in ipc-inventory.md | ✅ PASS |
| Capability permission gates (default-deny, typed denial errors) | capabilities contract tests | ✅ PASS |
| Tool approval bridge (deny blocks, abort-safe) | `packages/mdt-pi-runtime/tests/approval.test.ts` | ✅ PASS |
| Schema secret smuggling (strict modelPolicy rejects apiKey) | `packages/mdt-schema/tests/schema.test.ts` | ✅ PASS |

## CI-enforced gates

| Gate | Workflow | Blocking level |
| --- | --- | --- |
| npm audit (high+critical, with allowlist) | ci.yml `security` job | exit 1 on unapproved high/critical |
| License scan (all production deps) | ci.yml `security` job | exit 1 on non-allowlist license |
| Lint (0 errors, 0 warnings) | ci.yml `quality` job | exit 1 |
| Typecheck (strict, all workspaces) | ci.yml `quality` job | exit 1 |

## Residual risks (documented, not exploitable)

| Risk | Mitigation |
| --- | --- |
| 2 high advisories in `image-size` via `pptxgenjs` (dev-only fixture toolchain) | Allowlisted in `docs/release/audit-allowlist.json` with expiry 2026-12-31; never bundled in app or generated apps |
| Release artifacts unsigned | Documented in SECURITY.md; OS warnings expected |
| Generated app agent service binds localhost only | Documented in SECURITY.md; do not expose to network |

## Threat model reference

See [SECURITY.md](../../SECURITY.md) for the full threat model covering
renderer→main IPC, project files, Codex builds, generated agent apps,
and log sanitization.
