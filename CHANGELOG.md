# Changelog

All notable changes to MDT are documented here. Format based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning follows
[SemVer](https://semver.org/).

## [1.0.0] — 2026-09-15

First stable release. All P18 acceptance gates green (see MDT_1.0_ACCEPTANCE_REPORT.md).

### Added

- MDT project model (`@mdt/schema`): Zod single-source schemas with a
  published JSON Schema artifact, UUIDv7 stable identity, reference
  integrity validation, pure migration framework, deterministic
  BuildBlueprint with sha256 content hashes.
- Project IO (`@mdt/project`): atomic writes, debounced autosave with
  backpressure, crash-recovery snapshots, content-addressed asset store
  with dry-run GC, project lock with stale reclaim, recent projects with
  Windows case-insensitive identity.
- Capability Registry (`@mdt/capabilities`): manifest schema,
  deterministic registry, SSRF/path/spawn security guards, and 13 built-in
  capabilities (web_search, web_fetch, http_request, browser, file_read,
  file_write, file_list, shell, python, mcp, datetime, json, ask_user)
  with a shared contract test harness.
- Pi runtime adapter (`@mdt/pi-runtime`): blueprint-configured agents on
  `@earendil-works/pi-agent-core@0.85.1`, normalized runtime events,
  cancellation and error normalization.
- Codex bridge (`@mdt/codex`): app-server JSON-RPC client, isolated build
  workspaces with known-good tagging, apply/discard/rollback lifecycle,
  redacted JSONL build logs, deterministic fake client for CI.
- Design adapter (`@mdt-design`): deck→MDT projection with stable identity
  and a semantics overlay.
- MDT app surface: renderer project store, Agents panel (CRUD,
  instructions, model policy, capability assignment), Build panel
  (streaming, cancel, rollback, availability), welcome screen, schema-
  validated project IO IPC, builder orchestrator with bounded repair loop.

### Changed

- Vendored GenOffice Slides at `e064f3a`; removed all non-MDT apps
  (docs/sheets/pdf/markdown/html/shell) and unused packages with an
  evidence-based dependency audit; removed the GenOffice AI panel and all
  GenSpark account/cloud/credential surfaces.

## [0.1.0] — vendored baseline

Initial public baseline: GenOffice Slides engine imported at upstream
commit `e064f3ad686d0466408a15d91cf87efef158ee09` with full provenance
(see docs/upstream/GENOFFICE_BASELINE.md).
