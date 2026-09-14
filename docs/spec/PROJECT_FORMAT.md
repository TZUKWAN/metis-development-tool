# Project Format Specification (MDT 1.0, schemaVersion 1)

The MDT project format is an open, documented, plain-file format. Third
party tools can read and write it without executing MDT code.

## Directory layout

    <project>/
      mdt.project.json     # the project document (below)
      design/              # reserved for split-out design payloads
      assets/              # imported assets: assets/<sha256><ext>
      .mdt/                # MDT-private state (not part of the format contract)
        autosave.json      # latest autosave document
        recovery.json      # crash-recovery snapshot
        lock.json          # { pid, host, acquiredAt } — double-open guard
        builds/<id>/log.jsonl

## The project document

`mdt.project.json` is a single JSON object validated by the published JSON
Schema (packages/mdt-schema/schema/mdt-project.schema.json, JSON Schema
draft 2020-12). Summary of the model:

- `schemaVersion` (1) — bump triggers a registered migration chain
  (packages/mdt-schema/src/migrate.ts). Readers must refuse _newer_
  versions rather than guessing.
- `id` — UUIDv7 project identity. `name` is a human alias.
- `pages[]` — `type`: page | modal | drawer | popover | component; each has
  a `viewport`, `background`, `elements[]` and `metadata` (UI-only state
  such as interaction-canvas node positions; consumers must treat it as
  ignorable).
- `pages[].elements[]` — a tree (`children` models grouping). Every element
  carries a stable UUIDv7 `id`, a human `name`, a `role` (semantic kind:
  text/shape/image/icon/group/button/input/textarea/checkbox/select/tabs/
  list/datatable/chat/filepicker/codeblock/browserframe/component/custom),
  an adapter-owned `visual` payload (kind + geometry + style + props) and
  `semantics` (label, options, handles, componentRef, agentRef, …).
  Identity never changes on rename/move; duplicates always mint new ids.
- `agents[]` — id/name/instructions/modelPolicy/capabilityRefs/memory/
  isDefault. At most one `isDefault: true`. `modelPolicy` is **strict**:
  unknown keys (e.g. an apiKey) are schema errors — provider secrets never
  belong in the file.
- `capabilities[]` — instances of registry capabilities: `capabilityId`,
  pinned `version`, schema-checked `config`, `secrets` mapping slot names
  to `${secret:NAME}` references (raw secret values are invalid), and
  explicit permission `grants`.
- `interactions[]` — trigger (click/dblclick/change/submit/load) +
  discriminated-union action (navigate, openModal, openDrawer, close, back,
  toggleVisibility, submit, sendToAgent, invokeCapability, setVariable,
  bindOutput) + source page/element + enabled/condition.
- `bindings[]` — data flow: source (elementValue/literal/variable/
  agentOutput/capabilityOutput) → target element property.
- `variables[]` — scope project/page/session; page scope requires pageId;
  `defaultValue` must match the declared type.
- `assets[]` — content-addressed files (sha256 names) referenced by
  project-relative paths only.

## Reference integrity

All cross-references are UUIDv7 ids. Consumers can validate a document with
the rules implemented in packages/mdt-schema/src/refs.ts (dangling pages/
agents/capabilities/variables/components, page-type compatibility for
modal/drawer edges, component reference cycles, single default agent).

## Determinism contract

The BuildBlueprint (packages/mdt-schema/src/blueprint.ts) is the canonical
build input: sorted-key serialization, no timestamps, no UI-only state. Two
identical projects must produce identical blueprints and therefore
identical generated applications (modulo explicit ids chosen at authoring
time).
