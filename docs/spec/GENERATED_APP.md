# Generated Application Specification (MDT 1.0)

What MDT produces when you press **Build**, and the guarantees that come
with it.

## Shape

A generated app is an ordinary source repository:

    my-agent-app/
      package.json         # name, scripts (dev/build/test/e2e), engines >= 20
      vite.config.ts       # SPA build; /api proxied to the agent service
      index.html
      src/                 # React + TypeScript frontend
        pages/*.tsx        # one route per MDT Page (modals/drawers/popovers
                           # are overlays on their host page)
        elements/*.tsx     # semantic components (real <button>, <input>, …)
        agent-client.ts    # SSE client (stream + cancel)
        bindings.ts        # data-flow resolution
        variables.ts       # project/page/session variable stores
      server/              # Node + Express agent service (plain ESM JS)
        index.js           # /api/health, /api/agent/:id/run (SSE), /cancel
        pi-runtime.js      # @earendil-works/pi-agent-core wiring
        capabilities/*.js  # only the capabilities this app uses
        agents.config.json # agents, instructions, model policy, tool refs
      tests/               # vitest unit + Playwright e2e baselines
      .env.example         # variable NAMES only — never values
      README.md
      .mdt/generator-manifest.json  # generator-owned paths (regeneration map)
      .mdt-map.json        # MDT design id → source file mapping

## Guarantees

1. **Standalone** (no lock-in). `npm install && npm run dev` works with MDT
   deleted and uninstalled. Generated `package.json` never contains
   `@mdt/*` or `@openai/codex` dependencies — CI asserts both.
2. **Pi is the runtime** (ADR-0004). The agent loop, tool calling and
   streaming come from `@earendil-works/pi-agent-core` (pinned version).
   MDT does not reimplement or wrap-away the loop; the generated service
   constructs Pi `Agent`s directly from `agents.config.json`.
3. **Design fidelity with semantic HTML.** Elements render as real HTML
   with accessible names and `data-mdt-id` attributes; page geometry is
   preserved via positioned page containers. `.mdt-map.json` maps every
   design id to its source location, so "select in MDT → jump to code"
   round-trips.
4. **Capabilities are scoped.** Only capabilities the project actually
   assigns are emitted. Each emitted capability keeps its security guard
   (SSRF allowlist, sandbox roots, permission checks). Permission grants
   from the project are enforced at runtime; default-deny for
   filesystem/process/browser scopes.
5. **Secrets stay local.** The service reads provider keys from `.env`
   (git-ignored; `.env.example` lists names only). Secrets referenced by
   capabilities resolve from the same environment — never from project
   files, never logged (logs run through a redacting formatter).
6. **Deterministic regeneration with a patch boundary.** Regenerating
   overwrites generator-owned files and preserves everything else
   (Codex-authored edits, user edits). Conflicts are reported, never
   silently overwritten. `.mdt/generator-manifest.json` is the contract.
7. **Testability.** Each generated app ships a vitest unit suite and a
   Playwright e2e suite (route smoke, navigation interaction, chat round
   trip against a mocked SSE endpoint) that pass on a clean machine.

## Runtime contract

- The agent service binds localhost only. SSE events use MDT's normalized
  event shapes (run/turn/text/tool lifecycle), so the UI is decoupled from
  Pi's provider-level stream events.
- `POST /api/agent/:id/cancel` aborts the active turn (AbortSignal through
  Pi and every tool).
- Tool errors reach the model as failed tool results; the service never
  crashes on a failing capability.
