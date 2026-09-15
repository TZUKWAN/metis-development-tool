# MDT Architecture

How MDT turns a presentation-style design into a standalone agent
application. Package names map 1:1 to `packages/*` workspaces.

## The big picture

```
            ┌─────────────────────────── MDT desktop app (apps/mdt) ───────────────────────────┐
            │  renderer (React)                      main process (Node/Electron)              │
            │  ├─ Slides designer (vendored)         ├─ project IO      (@mdt/project)          │
            │  │   GenOffice Slides engine           ├─ builder orchestrator (mdt-builder)      │
            │  ├─ MDT store (zustand)  ◄── IPC ──►   ├─ capability/secret registry IPC          │
            │  │   └─ @mdt/design derivation         ├─ preview manager  (@mdt/preview)          │
            │  ├─ Interaction Canvas (@xyflow/react) └─ design bridge (durable ids)             │
            │  └─ Agents / Build / Semantics panels                                             │
            └────────────────────────────────────────┬──────────────────────────────────────────┘
                                                     │ Build
                                     Blueprint (@mdt/schema) + builderPrompt
                                                     │
                                     ┌───────────────▼────────────────┐
                                     │ @mdt/generator                 │
                                     │ deterministic scaffold (lint)  │
                                     └───────────────┬────────────────┘
                                                     │ + Codex turn(s) (@mdt/codex,
                                                     │   app-server, sandboxed)
                                     ┌───────────────▼────────────────┐
                                     │ generated/ workspace           │
                                     │ gates: install→build→test      │
                                     └───────────────┬────────────────┘
                                                     │ apply (git ff + known-good)
                                     ┌───────────────▼────────────────┐
                                     │ Generated app (standalone)     │
                                     │ Vite+React SPA  ◄─SSE─  Node   │
                                     │ + @earendil-works/pi-agent-core│
                                     │   + emitted capability runtimes│
                                     └────────────────────────────────┘
```

## Three roles, three boundaries (ADR-0002)

1. **GenOffice Slides** renders and edits pages. MDT code touches it only
   through `@mdt/design` (deck → MDT projection with durable ids) and the
   `slides:*` IPC the engine already speaks.
2. **OpenAI Codex** (`@mdt/codex`) is invoked only by the builder, only in
   the generated workspace, only with workspace-write + a git branch.
   Codex never ships in generated apps.
3. **Pi Agent Core** (`@mdt/pi-runtime`, and its plain-JS mirror inside
   generated apps) owns the agent loop of _user-built_ applications. MDT
   maps blueprints onto Pi and normalizes events back out — it never
   reimplements the loop.

## Data flow (design → code)

- The deck changes → `mdt:design-slides` hands durable-id page refs to the
  renderer store → `@mdt/design` derives/updates project pages+elements,
  preserving the semantics overlay (roles, agent bindings, handles).
- Agents, capability instances, interactions, bindings, variables live in
  the same ProjectRoot document (schema v1, `@mdt/schema`).
- Build: `toBuildBlueprint` → lint (`lintBlueprint`, refuses on errors) →
  `generateAndWrite` (deterministic scaffold, patch boundary) → Codex
  turn(s) on `mdt-build/<id>` → gates (install, vite build, vitest suite)
  → apply = ff-merge + `mdt-known-good/<id>` tag. Failure paths discard.

## Security model (P13)

- Renderer sandbox + contextIsolation; every MDT IPC payload is
  Zod-validated in main (P13.02).
- Filesystem containment via `resolveInSandbox` (canonicalize + refuse
  symlink escape); URL guard on every network capability (scheme
  allowlist, private/metadata blocks, per-redirect re-validation).
- Spawn discipline: `shell: false`, args arrays, env allowlist.
- Secrets: `${secret:NAME}` references in project files; values in
  Electron safeStorage (app) / `.env` (generated apps); logs sanitized.

## Package map

| Package             | Purpose                                                     |
| ------------------- | ----------------------------------------------------------- |
| `@mdt/schema`       | project model, ids, ref integrity, migrations, Blueprint    |
| `@mdt/project`      | project dir IO, autosave, recovery, assets, lock, recents   |
| `@mdt/design`       | deck ⇄ MDT projection with stable identity                  |
| `@mdt/capabilities` | registry, manifests, security guards, built-ins             |
| `@mdt/pi-runtime`   | Pi adapter + capability bridge (only Pi importer in MDT)    |
| `@mdt/codex`        | Codex app-server client, workspace lifecycle, build logs    |
| `@mdt/generator`    | Blueprint → deterministic app files (+ templates/web-agent) |
| `@mdt/preview`      | generated-app dev-server lifecycle                          |

## Key invariants

- Every cross-reference is a durable UUIDv7 — renames/reorders never break
  wires; duplicates always mint new ids.
- Determinism: identical project → identical Blueprint hash → identical
  generated files.
- Generated apps are standalone: no `@mdt/*`, no Codex; Pi comes from npm.
- Failed builds never touch last-known-good; rollback is one git reset.
