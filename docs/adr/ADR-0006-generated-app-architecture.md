# ADR-0006: Generated app architecture — Vite + React SPA + Node agent service

- Status: Accepted
- Date: 2026-09-15
- Deciders: MDT main agent

## Context

MDT generates complete, standalone source projects (tasklist §0.1 step 4/6,
P11). The generated app must: render MDT-designed pages faithfully; run
interactions (navigate/modal/drawer/toggle/submit); host Pi Agent Core with
Capability tools; stream agent events to the UI; support cancel; run
`npm install && npm run dev` with zero MDT involvement; and remain readable,
ordinary code a developer can edit.

## Decision

The `templates/web-agent` scaffold produces:

1. **Frontend**: Vite + React + TypeScript SPA. Each MDT `Page` → a route;
   Modal/Drawer/Popover → overlay components (not routes). Elements render
   with semantic HTML (real `<button>`, `<input>`, …) positioned via
   absolute layout inside page containers to preserve design fidelity, with
   `data-mdt-id` attributes for design↔source mapping (P11.05/P11.18).
2. **Agent service**: a Node + Express (TypeScript) process wrapping
   `@mariozechner/pi-agent-core`; owns model policy, registered Capability
   tools, session state, SSE streaming to the UI, cancellation, and
   tool-approval pause/resume.
3. **Shared contract**: `src/shared/protocol.ts` typed event/request shapes
   shared by both sides.
4. Everything is plain files — no MDT runtime dependency, no proprietary
   loader.

## Alternatives

- *Next.js*: heavier than needed for generated apps; SSR unnecessary for
  agent UIs; harder for users to reason about. Rejected for 1.0.
- *Electron generated apps*: tasklist targets web agent apps; rejected.
- *Single-process (agent in browser)*: rejected — capabilities like
  shell/file need a Node process; CORS/secret isolation demands a server.

## Consequences

- Generator emits deterministic file trees from the Blueprint (P11.01).
- The service is the security boundary for capabilities (P13.06, P09.12–09.15).
- Port/health management lives in the preview process manager (P12.03).
