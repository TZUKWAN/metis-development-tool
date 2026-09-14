# ADR-0005: Codex integration via `codex app-server` (JSON-RPC over stdio)

- Status: Accepted
- Date: 2026-09-15
- Deciders: MDT main agent

## Context

MDT's internal coding agent is OpenAI Codex (tasklist §0.3, P10). MDT must
stream progress/events, support cancel, run Codex inside an isolated build
workspace, and stay on an officially supported integration surface.
Verified (P10.01): installed `codex-cli 0.144.1` exposes
`codex app-server` ("Run the app server", JSON-RPC over stdio) plus
`codex exec` (one-shot non-interactive), `codex login status`, and
sandbox/config flags.

## Decision

- `packages/mdt-codex` in the **Electron main process** spawns
  `codex app-server` as a child process and speaks its JSON-RPC protocol
  (initialize → newConversation/turn, streaming agent turn events, interrupt).
- Renderer never spawns processes; it receives typed, redacted events over
  contextIsolation-safe IPC (P10.06).
- Build workspace isolation uses Codex sandbox/permission flags with cwd
  pinned to the generated workspace (P10.07/P13.05).
- A `CodexClient` interface abstracts the transport so tests and CI use a
  fake client (P14.08/P14.15).
- If `app-server` proves unusable in a given Codex version, the documented
  fallback is `codex exec --json` one-shot mode behind the same
  `CodexClient` interface (ADR amendment required).

## Alternatives

- *`codex exec` polling only*: simpler but no rich streaming/cancel; kept as
  fallback only.
- *MCP server mode (`codex mcp-server`)*: inverted direction — MDT would be
  the MCP client orchestrating tool calls manually; worse fit than the
  app-server's native conversation model.
- *OpenAI HTTP API directly*: forbidden — tasklist requires the real Codex
  agent, not "an LLM that returns code strings" (§6 pseudo-completion).

## Consequences

- `docs/upstream/CODEX_BASELINE.md` records the verified CLI version range;
  version check warns outside it (P10.19).
- Cancel must kill the child process tree (P10.14).
- All build IO is logged as JSONL under `.mdt/builds/<id>/` with secret
  redaction (P10.17).
