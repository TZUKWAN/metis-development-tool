# ADR-0004: Pi Agent Core as generated-app runtime

- Status: Accepted
- Date: 2026-09-15
- Deciders: MDT main agent

## Context

Applications built with MDT need a real agent runtime: model calls, agent
loop, tool calling, streaming, state. The tasklist mandates **Pi Agent
Core** and forbids reimplementing its loop. Verified (P08.01): npm package
`@mariozechner/pi-agent-core@0.73.1` (repo `badlogic/pi-mono`,
`packages/agent`, MIT; deps: `@mariozechner/pi-ai@^0.73.1`, `typebox`).

## Decision

- Generated agent apps depend on the **official published**
  `@mariozechner/pi-agent-core` (version pinned in the generator template;
  re-verify at release time per P08.01).
- `packages/mdt-pi-runtime` is a thin adapter: it maps MDT Capability
  Registry manifests → Pi tool definitions (TypeBox schemas), exposes a
  narrow MDT-facing surface (`createAgent`, `registerTool`, `runTurn`,
  event stream), and is the only package allowed to import
  `@mariozechner/*`.
- MDT never forks Pi source; the generated app installs Pi from npm like
  any ordinary dependency, so it runs without MDT.

## Alternatives

- *Vendoring Pi source into templates*: rejected — freezes upstream bugs,
  inflates generated repo, breaks "official package" requirement.
- *Vercel AI SDK / LangChain as runtime*: rejected — tasklist mandates Pi.
- *Custom loop*: forbidden by tasklist §0.3.

## Consequences

- Runtime tool schemas come from the MDT Capability Registry (P11.10).
- Pi version upgrades are a deliberate template change with a recorded
  verification note in `docs/upstream/PI_BASELINE.md`.
- Generated apps keep a `pi` boundary module so a future runtime swap is
  localized.
