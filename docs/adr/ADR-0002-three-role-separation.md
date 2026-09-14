# ADR-0002: Role separation — GenOffice Slides / Codex / Pi Agent Core

- Status: Accepted
- Date: 2026-09-15
- Deciders: MDT main agent (per MDT_1.0_TASKLIST §0.3)

## Context

Three AI/engine components are involved in MDT. Mixing their
responsibilities is the biggest architectural risk: it would couple the
designer to a specific agent runtime, put a coding agent inside user apps,
or reimplement an agent loop MDT does not own.

## Decision

Strict three-role separation, enforced by package boundaries:

1. **GenOffice Slides engine** (`packages/pptx-engine`, `pptx-render`,
   `packages/ui`, `apps/mdt` renderer): PowerPoint-style editing experience
   only. No agent runtime, no coding-agent logic.
2. **OpenAI Codex** (`packages/mdt-codex`): MDT's *internal* coding agent.
   Reads the MDT Blueprint + code + test results, edits the generated app in
   an isolated workspace. Never ships inside generated apps, never acts as
   the runtime of user agents.
3. **Pi Agent Core** (`packages/mdt-pi-runtime`,
   `@mariozechner/pi-agent-core`): the *runtime* of the agent apps users
   build. Owns model calls, agent loop, tool calling, state. MDT never
   reimplements the Pi loop and never uses the Pi CLI coding agent as
   MDT's coding agent.

## Alternatives

- *Use Codex as the user-facing runtime*: rejected — vendor lock-in, wrong
  abstraction, Codex is a coding agent not an app runtime.
- *Use the Pi coding CLI as MDT's builder*: rejected — Pi's CLI agent is a
  general coding agent; MDT's builder must speak the Blueprint contract and
  the task explicitly assigns that role to Codex.
- *Reimplement the agent loop in MDT*: rejected — duplicated maintenance,
  loses upstream Pi improvements.

## Consequences

- `apps/mdt` renderer may not import `@mariozechner/*` directly; only
  generated apps and `mdt-pi-runtime` may.
- Generated app `package.json` must not contain `@openai/codex` (CI-checked).
- `mdt-codex` may not import Pi packages.
