# Codex CLI Integration Baseline (`mdt-codex`)

> Verified 2026-09-15 (MDT task P10.01): CLI/config surface inspected locally;
> protocol extracted from the installed binary's own schema generator
> (`codex app-server generate-json-schema`), cross-checked against upstream
> docs. No agent turns were run during research.

## 1. Versions and where the protocol docs live

| Item                          | Value                                                                                                                       |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Local CLI                     | `codex-cli 0.144.1` (`codex --version`)                                                                                     |
| Latest published              | `0.154.0` (`npm view @openai/codex version`)                                                                                |
| Windows binary (this machine) | `%APPDATA%\npm\node_modules\@openai\codex\node_modules\@openai\codex-win32-x64\vendor\x86_64-pc-windows-msvc\bin\codex.exe` |
| Canonical protocol doc        | https://github.com/openai/codex/blob/main/codex-rs/app-server/README.md                                                     |
| Official pages                | https://developers.openai.com/codex/app-server , `/non-interactive-mode`, `/agent-approvals-security`, `/auth`              |

**Drift warning:** `main` is ahead of 0.144.1 (e.g. `thread/rollback` →
`thread/revert`). Always re-verify against the installed binary's schema:
`codex app-server generate-json-schema -o <dir>`.

## 2. Integration: `codex app-server` (JSON-RPC 2.0, newline-delimited, stdio)

Spawn `codex app-server`; one JSON-RPC message per line on stdin/stdout.
Marked `[experimental]` but is the interface OpenAI's own VS Code extension
and desktop app use.

### Handshake

```json
{
  "jsonrpc": "2.0",
  "id": 0,
  "method": "initialize",
  "params": {
    "clientInfo": { "name": "MDT", "title": "Metis Development Tool", "version": "1.0.0" },
    "capabilities": { "experimentalApi": true }
  }
}
```

→ `InitializeResponse { codexHome, platformFamily, platformOs, userAgent }`,
then notification `initialized`, then optionally `account/read` →
`{ requiresOpenaiAuth, account }` for an in-process auth check.

### Thread lifecycle (0.144.1 method names)

- **`thread/start`** — params: `cwd`, `model`, `approvalPolicy`, `sandbox`
  (kebab shorthand `"workspace-write"`), `baseInstructions`, `config`
  overrides, `ephemeral`. → `Thread { id (UUIDv7), cwd, cliVersion, status, … }`;
  notification `thread/started`.
- **`turn/start`** — `threadId`, `input: UserInput[]`
  (`{type:"text",text}`), per-turn `cwd`/`model`/`approvalPolicy`/
  `sandboxPolicy` (camelCase object `{type:"workspaceWrite", writableRoots,
networkAccess}`), `outputSchema`. → notification `turn/started`
  `{ threadId, turn }` (**capture `turnId` here**).
- **`turn/interrupt`** — `threadId` **and** `turnId`; cancellation
  primitive; safe to send after completion (error response is ignorable).
- **`thread/resume`** — by `threadId` (preferred), in-memory `history`, or
  rollout file `path`.
- Streaming notifications: `turn/completed` (`turn.status`: `completed |
interrupted | failed | inProgress`, `usage`, `error`), `turn/diff/updated`
  (aggregate file diff), `turn/plan/updated`, `thread/tokenUsage/updated`,
  **`item/started` / `item/completed`** (`ThreadItem` types include
  `agentMessage`, `commandExecution` (`command`, `cwd`, `status`,
  `aggregatedOutput`, `exitCode`), `fileChange` (`changes`), `mcpToolCall`,
  `webSearch`, `reasoning`), **`item/agentMessage/delta`** (assistant text
  streaming), `command/exec/outputDelta` (command output streaming),
  `error`, `warning`.
- Server→client **requests** (approval path — must be answered or the turn
  stalls): `item/commandExecution/requestApproval`,
  `item/fileChange/requestApproval`, `item/permissions/requestApproval`,
  `item/tool/requestUserInput`, … With `approvalPolicy: "never"` these do
  not fire; still implement an auto-decline timeout.

### Canonical mdt-codex flow

```
spawn codex app-server
  → initialize → initialized → account/read
  → thread/start { cwd: <workspace>, sandbox: "workspace-write",
                   approvalPolicy: "never" }
  → turn/start { threadId, input: [{type:"text", text: <task>}] }
      ← item/started / item/agentMessage/delta / command/exec/outputDelta
      ← item/completed ×N → turn/completed
  cancel: → turn/interrupt { threadId, turnId }
  shutdown: kill child process tree
```

## 3. Sandbox / isolation

| Mode                  | Meaning                                             |
| --------------------- | --------------------------------------------------- |
| `read-only`           | no writes anywhere                                  |
| **`workspace-write`** | writes limited to cwd + temp dirs — **MDT default** |
| `danger-full-access`  | never use from MDT                                  |

- cwd pinned via `thread/start.cwd` (or CLI `-C/--cd`).
- Under `workspace-write`, `<writable_root>/.git` is read-only to the agent
  (protects workspace history).
- Network: off by default; enable per-build only when dependency installs
  are required: config `sandbox_workspace_write.network_access = true` or
  `sandboxPolicy.networkAccess: true`.
- Approval policy: `never` for headless MDT builds (`untrusted` is retired).
- Windows: native sandboxing built in; first run may require
  `windowsSandbox/setupStart` → `windowsSandbox/setupCompleted` handshake
  (methods present in 0.144.1 schema); check `windowsSandbox/readiness`.

## 4. Fallback: `codex exec --json`

Flags: `-C <dir>`, `-s workspace-write`, `-a never`, `--skip-git-repo-check`
(required outside a git repo), `--ephemeral`, `--ignore-user-config`,
`--output-last-message <FILE>`, `--json`. Event lines (snake_case — do not
share parsers with app-server):

```json
{"type":"thread.started","thread_id":"…"}
{"type":"turn.started"}
{"type":"item.started","item":{"id":"item_1","type":"command_execution","command":"…","status":"in_progress"}}
{"type":"item.completed","item":{…}}
{"type":"turn.completed","usage":{…}}
```

Cancellation = kill the process (turn lost; session resumable by id).

## 5. Auth

- `codex login status` → exit 0 + "Logged in using ChatGPT" (verified
  locally). No `--json` flag exists.
- In-process: app-server `account/read`.
- **MDT never reads `~/.codex/auth.json`** (OAuth tokens; opaque).
- `codex login --with-api-key` reads key from stdin (CI-only path, never
  argv).

## 6. Windows notes

- npm installs `codex.cmd`/`codex.ps1` shims; Node ≥ 18.20 refuses to spawn
  `.cmd` without `shell: true` (EINVAL). **Spawn the vendored native
  `codex.exe` directly** (path resolvable relative to the `@openai/codex`
  package dir).
- Process-tree kill on cancel/quit: `turn/interrupt` first, then
  `taskkill /PID <pid> /T /F` as last resort.
- Pass Windows-native absolute paths in `cwd`/`writableRoots`.

## 7. Gotchas

1. Re-generate the protocol schema for the pinned binary; `main` has
   drifted.
2. `turn/interrupt` needs `turnId` (from `turn/started`).
3. Sandbox spelling differs: `sandbox: "workspace-write"` (thread/start)
   vs `sandboxPolicy: {type: "workspaceWrite"}` (turn/start).
4. Approval requests are requests — an unanswered one hangs the turn;
   auto-decline on timeout.
5. User `~/.codex/config.toml` leaks in unless overridden — use
   `thread/start.config` / `--ignore-user-config` for hermetic builds.
6. Authless startup surfaces late — check `account/read` right after
   `initialize`.
7. Stdio framing is one JSON-RPC message per line; use a line-buffered
   reader; truncate before logging.
8. `thread/start.ephemeral: true` avoids writing session rollout files when
   MDT keeps its own audit trail in `.mdt/builds/<id>/`.
