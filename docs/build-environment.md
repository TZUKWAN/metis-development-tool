# MDT Build Environment (verified 2026-09-15)

Recorded during the P01.01 toolchain audit. All commands below were executed
for real on the build machine.

## Toolchain versions (actual output)

| Tool | Version | Command |
| --- | --- | --- |
| git | `git version 2.54.0.windows.1` | `git --version` |
| GitHub CLI | `gh version 2.95.0 (2026-06-17)` | `gh --version` |
| Node.js | `v25.6.0` | `node --version` |
| npm | `11.8.0` | `npm --version` |
| Codex CLI | `codex-cli 0.144.1` (npm package `@openai/codex`, latest published: `0.154.0`) | `codex --version` |
| TypeScript (repo) | `^5.9.3` (from upstream lockfile) | `npm ls typescript` |

## Satisfied requirements

- GenOffice/MDT requires `node >=22.12.0`, `npm >=10` (root `package.json`
  `engines`, `.nvmrc` = `22`). Host Node `v25.6.0` satisfies `>=22.12.0`.
- GitHub CLI is authenticated as `TZUKWAN` with scopes `gist, read:org, repo,
  workflow` — sufficient to create and manage the public
  `TZUKWAN/metis-development-tool` repository and run GitHub Actions.
- Codex CLI is authenticated via ChatGPT account (`codex login status`).

## External service baselines

| Component | Verified value | Source |
| --- | --- | --- |
| GenOffice upstream | `main` @ `e064f3ad686d0466408a15d91cf87efef158ee09` (2026-09-14) | `git ls-remote` / clone |
| Pi Agent Core | npm `@mariozechner/pi-agent-core@0.73.1` (repo `badlogic/pi-mono`, MIT) | `npm view` |
| Pi AI (model layer) | npm `@mariozechner/pi-ai@0.73.1` | `npm view` |
| Codex | npm `@openai/codex@0.154.0` latest; local CLI `0.144.1` | `npm view` / `codex --version` |
| React Flow | `@xyflow/react` (version pinned during P07.01) | npm |

## Model provider used for real acceptance runs

A local OpenAI-compatible endpoint is used for live runtime acceptance
(P18.09/P18.10). Credentials are **never** committed: they live in
untracked `.env` files excluded by `.gitignore` (see
`docs/testing/live-provider.md` for the variable names only).
