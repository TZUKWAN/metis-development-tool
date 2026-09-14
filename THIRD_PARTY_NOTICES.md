# Third-Party Notices for Metis Development Tool (MDT)

MDT is licensed under the Apache License, Version 2.0. This file lists the
major third-party components MDT depends on or reuses, with their licenses.
The exhaustive, machine-generated list of bundled npm packages is produced at
packaging time by `node tools/gen-third-party-notices.mjs` (output:
`THIRD-PARTY-NOTICES.txt`, shipped inside release bundles).

## Reused upstream project

| Component                                             | License    | Copyright             | Role in MDT                                                                                                                                                                             |
| ----------------------------------------------------- | ---------- | --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [GenOffice](https://github.com/genspark-ai/genoffice) | Apache-2.0 | © 2026 Mainfunc, Inc. | PowerPoint-style Slides editor engine (Canvas, text, shapes, images, selection, undo/redo, thumbnails, pptx import/export). Baseline commit `e064f3ad686d0466408a15d91cf87efef158ee09`. |

## Runtime dependencies of MDT and generated agent apps

| Component                                                                            | License                                                                     | Role                                                                                                                                       |
| ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| [Pi Agent Core (`@mariozechner/pi-agent-core`)](https://github.com/badlogic/pi-mono) | MIT                                                                         | Agent runtime (agent loop, tool calling, state) of the agent apps users build with MDT.                                                    |
| [Pi AI (`@mariozechner/pi-ai`)](https://github.com/badlogic/pi-mono)                 | MIT                                                                         | Model provider layer used by Pi Agent Core in generated apps.                                                                              |
| OpenAI Codex (`@openai/codex`, codex CLI)                                            | Apache-2.0                                                                  | MDT's internal coding agent that turns MDT Blueprints into real code in an isolated workspace. Not bundled into generated apps by default. |
| React Flow (`@xyflow/react`)                                                         | MIT                                                                         | MDT Interaction Canvas (infinite node/edge graph).                                                                                         |
| React / React DOM                                                                    | MIT                                                                         | UI framework (MDT renderer and generated apps).                                                                                            |
| Konva / react-konva                                                                  | MIT (Konva)                                                                 | GenOffice Slides canvas rendering, reused by the MDT Designer.                                                                             |
| opentype.js                                                                          | MIT                                                                         | Font metrics for the Slides engine.                                                                                                        |
| Electron                                                                             | MIT                                                                         | Desktop shell of MDT itself (not part of generated web apps).                                                                              |
| TypeScript                                                                           | Apache-2.0                                                                  | Language/tooling.                                                                                                                          |
| Vite / electron-vite                                                                 | MIT                                                                         | Build tooling.                                                                                                                             |
| Vitest                                                                               | MIT                                                                         | Test framework.                                                                                                                            |
| Playwright (`@playwright/test`)                                                      | Apache-2.0                                                                  | E2E testing for MDT and generated apps.                                                                                                    |
| Zod                                                                                  | MIT                                                                         | Schema validation (MDT project schema).                                                                                                    |
| harfbuzzjs                                                                           | MIT                                                                         | Text shaping (Slides engine).                                                                                                              |
| pngjs / utif2                                                                        | MIT / LGPL-3.0-or-later (utif2, used as npm runtime dep of upstream slides) | Image codecs in the Slides engine.                                                                                                         |

## Fonts

Bundled fonts and their licenses are documented in
`apps/docs/src/renderer/fonts/README.md` (inherited from GenOffice; any font
that MDT ships is listed there).

## Unicode data

The Unicode Character Database portion inherited from GenOffice is covered by
the Unicode License v3 — see `LICENSE-UNICODE.txt`.

## OOXML schemas

ISO/IEC 29500-4:2016 (ECMA-376 Part 4, Transitional) XML Schemas under
`tools/ooxml-validate/schemas` are used only by tests/development tooling and
are not shipped in the application (inherited arrangement from GenOffice).

## Notes

- All GenOffice-derived files retain their original copyright and Apache-2.0
  headers. The upstream baseline is recorded in
  `docs/upstream/GENOFFICE_BASELINE.md`.
- License compatibility: Apache-2.0 (GenOffice, Codex, Playwright, TS) + MIT
  (Pi, React Flow, React, Konva, Vite, Vitest, Zod) is a permissive,
  Apache-2.0-compatible combination including explicit patent grants.
  Dependency license scanning runs in CI (`npm run licenses`,
  `tools/check-licenses.mjs`) and release notes include the SBOM.
