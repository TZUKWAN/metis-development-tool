# Pi Agent Core — Verified Integration Baseline

> Verified 2026-09-15 by unpacking the published npm tarballs and reading the
> shipped `.d.ts` files (not just docs). MDT task P08.01.

## 1. Package naming — verified deprecation (decision-relevant)

The "Pi" project (Mario Zechner, MIT) moved:

| Item                       | Verified value                                                                                                                                                                                                |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Old npm scope              | `@mariozechner/pi-agent-core@0.73.1`, `@mariozechner/pi-ai@0.73.1` — **frozen**: `latest` = 0.73.1 = final release under this scope; npm marks both _"please use @earendil-works/pi-_ instead going forward"* |
| **Current official scope** | **`@earendil-works/pi-agent-core@0.85.1`** (dist-tag `latest`), **`@earendil-works/pi-ai@0.85.1`**; a `legacy-node20` dist-tag exists at 0.74.2                                                               |
| Repo                       | https://github.com/badlogic/pi-mono → redirects to **https://github.com/earendil-works/pi** (MIT; active; tag `v0.73.1` = `781152fc24841dc54b22284514604048ebe5e2c9`)                                         |
| Docs                       | https://pi.dev / https://pi.dev/docs/latest                                                                                                                                                                   |
| Node requirement           | `node >= 20.0.0` (both scopes)                                                                                                                                                                                |
| Module format              | **ESM only** (`"type": "module"`)                                                                                                                                                                             |

**MDT decision (ADR-0004, amended):** generated agent apps depend on the
official _current_ name — `@earendil-works/pi-agent-core` — pinned to an
exact version (0.85.1 at baseline). The deprecated `@mariozechner` scope is
documented here for provenance only; MDT code must not import it.

## 2. API surface at the pinned version (0.85.1, read from `dist/*.d.ts`)

0.85.1 exports a much larger surface than 0.73.1 (harness, compaction,
sessions, skills, telemetry). The pieces MDT's generated apps use:

- `Agent` class (`dist/agent.d.ts:32`) — options include `initialState`,
  `streamFn` (**required in 0.85.1**, use `streamSimple` from pi-ai),
  `getApiKey`, `beforeToolCall`/`afterToolCall` hooks, `toolExecution`,
  `sessionId`. Methods: `prompt(message | input, images?)` (:108-109),
  `abort()` (:98), `subscribe(listener)` (:70), `waitForIdle()`, `steer()`,
  `followUp()`.
- `AgentTool` — `{ name, label, description, parameters /* TypeBox */,
execute(toolCallId, params, signal, onUpdate) }`; execute **throws** on
  failure (throw → tool result with `isError: true`).
- Events (`AgentEvent` union): `agent_start`, `turn_start`, `message_start`,
  `message_update` (assistant token deltas via
  `assistantMessageEvent`, e.g. `text_delta`), `message_end`,
  `tool_execution_start/_update/_end`, `turn_end`, `agent_end`.
- Cancellation: `agent.abort()` → active `AbortSignal` reaches tool
  `execute()` and all subscribers; aborted provider streams end with
  `stopReason: "aborted"`.
- Model config for **any OpenAI-compatible endpoint**: build a `Model`
  object (`api: "openai-completions"`, `baseUrl`, `provider`, `id`,
  `contextWindow`, `maxTokens`, optional `compat` quirk flags such as
  `supportsDeveloperRole: false`, `supportsReasoningEffort: false` for
  vLLM/Ollama-style servers). There is no provider-registration step.
- API keys: custom provider names get **no env-var fallback** — generated
  apps must supply `getApiKey` (or stream `apiKey`). MDT generated apps
  wire this from their own `.env`/config, never from MDT.
- State/persistence: none built-in — persist by JSON-serializing
  `agent.state.messages` and restoring via `initialState.messages`. (The
  newer harness/session modules exist but MDT 1.0 does not rely on them.)

## 3. Gotchas carried into MDT implementation

1. ESM-only → generated apps are ESM (`"type": "module"`), Node ≥ 20.
2. `streamFn` is mandatory at 0.85.1 — pass `streamSimple`.
3. Tools throw; never return error text as content.
4. Parallel tool execution is default; `tool_execution_end` arrives in
   completion order.
5. TypeBox v1 (`typebox`) — import `Type` from pi-ai re-exports to avoid
   version mismatch.
6. Custom endpoints commonly reject `developer` role / `reasoning_effort` —
   set `compat` flags from the model policy in the Blueprint.

## 4. Sources

- npm: `npm view @earendil-works/pi-agent-core` / `@earendil-works/pi-ai`
  (versions, dist-tags, deprecation note on old scope).
- Tarballs unpacked and read: `@earendil-works/pi-agent-core-0.85.1.tgz`
  (`dist/agent.d.ts`, `dist/types.d.ts`, `dist/index.d.ts`),
  `@mariozechner/pi-agent-core-0.73.1.tgz`,
  `@mariozechner/pi-ai-0.73.1.tgz`.
- Repo: https://github.com/earendil-works/pi (MIT).
