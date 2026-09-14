# Architecture Decision Records (ADR)

MDT records every architecture-relevant decision as a short, numbered ADR in
this directory. An ADR is **immutable once accepted**: to change a decision,
write a new ADR that supersedes the old one and mark the old one
`Superseded by ADR-XXXX`.

## Format

Each ADR is a Markdown file named `ADR-NNNN-short-title.md` with:

```markdown
# ADR-NNNN: <Title>

- Status: Proposed | Accepted | Superseded by ADR-MMMM
- Date: YYYY-MM-DD
- Deciders: <names/roles>

## Context
Why this decision was needed; forces at play.

## Decision
What we decided, precisely.

## Alternatives
Options considered and why they were rejected.

## Consequences
What becomes easier/harder; follow-up obligations.
```

## Required ADR topics (non-exhaustive)

License choice, project file format, GenOffice vendoring strategy, Codex
integration mechanism, Pi runtime adoption, Capability manifest schema,
sandbox/permission model, generated-app target architecture, security model,
test strategy, release/distribution model.

## Index

| ADR | Title | Status |
| --- | --- | --- |
| [ADR-0001](./ADR-0001-apache-2-license-and-upstream-vendoring.md) | Apache-2.0 license + fetch-only GenOffice vendoring | Accepted |
| [ADR-0002](./ADR-0002-three-role-separation.md) | Role separation: GenOffice Slides / Codex / Pi Agent Core | Accepted |
| [ADR-0003](./ADR-0003-zod-schema-dual-source.md) | Zod single-source schema with generated JSON Schema | Accepted |
| [ADR-0004](./ADR-0004-pi-agent-core-runtime.md) | Pi Agent Core as generated-app runtime via `@mariozechner/pi-agent-core` | Accepted |
| [ADR-0005](./ADR-0005-codex-integration.md) | Codex integration via codex CLI app-server (JSON-RPC) in main process | Accepted |
| [ADR-0006](./ADR-0006-generated-app-architecture.md) | Generated app architecture: Vite + React SPA + Node service | Accepted |
| [ADR-0007](./ADR-0007-test-strategy.md) | Test strategy: Vitest unit/integration + Playwright E2E + fake-Codex CI gate | Accepted |
