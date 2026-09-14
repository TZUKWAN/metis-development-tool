# ADR-0003: Zod single-source schema with generated JSON Schema

- Status: Accepted
- Date: 2026-09-15
- Deciders: MDT main agent

## Context

The MDT project file (`mdt.project.json`) needs both compile-time TypeScript
types and runtime validation. Third-party tooling (tasklist P17.06: "第三方
工具可解析") needs a published JSON Schema. Keeping hand-written TypeScript
types and hand-written JSON Schema in sync is a classic drift bug.

## Decision

`packages/mdt-schema` defines the project model once with **Zod**
(`zod-to-json-schema` for the published JSON Schema artifact). Zod is chosen
over TypeBox because its discriminated unions (interaction actions, element
semantics) map directly to the model's needs, inference is ergonomic, and
custom refinement/validation is first-class. The JSON Schema is generated in
a build step and committed (`packages/mdt-schema/schema/mdt-project.schema.json`)
so downstream tools never need to execute MDT code.

## Alternatives

- *TypeBox*: also emits JSON Schema natively; rejected only because Zod's
  ecosystem (`zod-to-json-schema`, familiarity, richer refinements) and the
  team's need for recursive union validation outweighed TypeBox's marginally
  lighter runtime.
- *Hand-written dual sources*: rejected — guaranteed drift.
- *JSON Schema first, codegen TS*: rejected — worse DX, generated types hard
  to keep readable.

## Consequences

- `schemaVersion` migrations are Zod-versioned transforms (P04.14).
- CI regenerates the JSON Schema and fails if it is stale.
- Validation errors must surface machine-readable paths (Zod issues →
  `IssuePath` mapping) for the P05.09 corrupted-project UX.
