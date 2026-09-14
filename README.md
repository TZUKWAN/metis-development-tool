<h1 align="center">Metis Development Tool (MDT)</h1>

<p align="center"><b>Design and build Agent applications like making a PowerPoint deck.</b><br>
Free, permanently open source (Apache-2.0). No vendor lock-in: what you build is ordinary, standalone source code.</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-blue" alt="License: Apache-2.0"></a>
  <a href="https://github.com/TZUKWAN/metis-development-tool/releases"><img src="https://img.shields.io/github/v/release/TZUKWAN/metis-development-tool" alt="Latest release"></a>
  <a href="https://github.com/TZUKWAN/metis-development-tool/actions"><img src="https://img.shields.io/github/actions/workflow/status/TZUKWAN/metis-development-tool/ci.yml?branch=main" alt="CI"></a>
</p>

---

## What is MDT?

MDT is a desktop development tool for **designing and building Agent
applications** the same way you make a presentation:

1. **Design** — a PowerPoint-style editor (pages, canvas, text, shapes,
   images, buttons, inputs, lists, chat) where each *page* of your agent's UI
   is a slide-like canvas. Pages can be Pages, Modals, Drawers, Popovers or
   reusable Components.
2. **Connect** — an infinite interaction canvas shows all your pages, agents
   and capabilities as nodes. Draw connections to say *what happens when*:
   click → navigate, open a modal, send text to an agent, invoke a
   capability, bind results into the UI.
3. **Build** — MDT compiles your design into a structured **Blueprint** and
   hands it to [OpenAI Codex](https://github.com/openai/codex), which
   implements it as real code in an isolated workspace — then MDT runs
   typecheck, unit tests, integration tests, Playwright E2E, visual checks
   and security checks, and feeds real errors back to Codex until green.
4. **Run** — the generated app uses [Pi Agent Core](https://github.com/badlogic/pi-mono)
   (`@mariozechner/pi-agent-core`) as its agent runtime, calling the
   capabilities you assigned (web search, web fetch, HTTP, browser, files,
   shell, Python, MCP, …).
5. **Own it** — export the generated project: a plain, readable, standalone
   source repository with README, `.env.example`, install/run/test scripts.
   Delete MDT and your app keeps working. **No lock-in.**

### Role separation (important)

| Component | Role in MDT |
| --- | --- |
| **GenOffice Slides** engine | The PowerPoint-style editing experience (canvas, text, shapes, images, selection, undo/redo, thumbnails, PPTX import/export). Vendored under Apache-2.0 — see [attribution](#upstream-attribution). |
| **OpenAI Codex** | MDT's *internal* coding agent. Turns Blueprints into code. Never ships inside your app. |
| **Pi Agent Core** | The *agent runtime* of the apps you build. Owns the agent loop, tool calls, streaming, state. MDT never reimplements it. |

## Quick start (contributors)

```sh
git clone https://github.com/TZUKWAN/metis-development-tool.git
cd metis-development-tool
npm ci
npm run dev:mdt        # launch the MDT desktop app
npm run test:mdt       # unit + integration tests
npm run typecheck:mdt  # TypeScript strict checks
```

Requirements: Node ≥ 22.12, npm ≥ 10 (see `docs/build-environment.md` for the
verified toolchain). Codex CLI is optional but required for *Build*;
`codex login` uses your own OpenAI/ChatGPT account.

## Documentation

- [Architecture](ARCHITECTURE.md) · [ADRs](docs/adr/README.md)
- [User Guide](docs/guide/USER_GUIDE.md) — design → connect → build → run → export
- [Capability Guide](docs/guide/CAPABILITIES.md) — built-in tools, secrets, permissions
- [Capability SDK](docs/guide/CAPABILITY_SDK.md) — write your own capability
- [Project Format Spec](docs/spec/PROJECT_FORMAT.md)
- [Generated App Spec](docs/spec/GENERATED_APP.md)
- [Security](SECURITY.md) — threat model, reporting
- [Contributing](CONTRIBUTING.md) · [Changelog](CHANGELOG.md) · [Roadmap](ROADMAP.md)
- [Upstream policy](docs/upstream/UPDATE_GENOFFICE.md)

## Upstream attribution

MDT is built on [GenOffice](https://github.com/genspark-ai/genoffice)
(Apache-2.0, © 2026 Mainfunc, Inc.) — specifically its Slides editor engine,
vendored at baseline commit
`e064f3ad686d0466408a15d91cf87efef158ee09` (recorded in
[docs/upstream/GENOFFICE_BASELINE.md](docs/upstream/GENOFFICE_BASELINE.md)).
All GenOffice-derived files retain their original copyright and license
headers. MDT is an independent project: it is **not** a GenOffice fork on
GitHub's fork network, and it does not send code, PRs or branches to
GenOffice. See [NOTICE](NOTICE) and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## License

[Apache-2.0](LICENSE). MDT and its upstream GenOffice components are
Apache-2.0; Pi Agent Core, React Flow, React and Konva are MIT; the full
dependency license picture is in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)
and the release SBOM.
