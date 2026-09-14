# MDT Roadmap

## 1.0 — stable open-source release (current)

The full 1.0 engineering checklist lives in `MDT_1.0_TASKLIST.md` (310
tasks) with live status in `TASK_STATUS.md`. Highlights:

- PowerPoint-style designer (vendored GenOffice Slides engine)
- MDT project model with stable identity + published JSON Schema
- Interaction Canvas (React Flow) for wiring pages, modals, agents
- Agent designer with capability assignment (13 built-ins + SDK)
- Codex-powered builds with quality gates, repair loop, rollback
- Generated apps: standalone Vite+React+Node projects running Pi Agent Core
- Windows / macOS / Linux packaging with SBOM

## 1.1 — designer depth

- Element-level interaction handles directly on the design canvas
- Real page thumbnails in the Interaction Canvas nodes
- Component system (create/insert/override with cycle protection UI)
- Theming tokens surfaced in the property inspector
- Auto-layout strategies for large interaction graphs

## 1.2 — runtime depth

- Agent-to-agent handoffs as first-class graph edges
- Long-term memory backends for generated agents
- Tool approval UI polish (pause/resume with diff previews)
- Structured tracing export (OTLP) from generated apps

## 1.3 — ecosystem

- Capability marketplace conventions (signed manifests)
- Third-party capability sandboxing hardening
- Template gallery beyond `web-agent`
- i18n for generated apps following MDT's locale settings

## Non-goals (by design)

- Becoming a GenOffice release channel or contributing upstream via PR
  (see CONTRIBUTING.md upstream policy)
- Hosting generated apps as a service; MDT produces standalone repos
- Lock-in of any kind: no MDT runtime dependency in generated apps
