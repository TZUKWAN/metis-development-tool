# MDT User Guide

The whole workflow, for someone who knows PowerPoint but has never built
an agent.

## 1. Create a project

Launch MDT → **New Project**, give it a name. (Everything is saved inside
a plain folder you own; you can put it under git at any time.)

## 2. Design pages like slides

- The left panel lists your **pages** — each one is a canvas you design
  with text, shapes, images, and UI controls (buttons, inputs, lists,
  chat, …) from the **Insert** ribbon.
- Page types: a normal **Page**, plus **Modal**, **Drawer** and **Popover**
  surfaces — same editor, different behavior when the app runs.
- Undo/redo, multi-select, grouping, alignment: all the PowerPoint habits
  work.

## 3. Connect things (Interactions tab)

Open the **Interactions** tab in the MDT dock. Every page appears as a
node. Drag a connection from a page to another page to make a click
navigate, open a modal, or open a drawer; drag to an **agent** to send it
information. Click any connection to edit when it fires (click, change,
submit, page load) and what it does. The lint bar warns about dangling
links or missing settings.

## 4. Design your agent (Agents tab)

- Create an agent; write its **system instructions** (what it is, how it
  answers).
- Choose a **model** — any OpenAI-compatible endpoint works (provider,
  model name, base URL). Keys stay in your environment, never in the
  project.
- Assign **capabilities** (tools) — e.g. `web_search` and `web_fetch` for
  a research agent. High-risk tools (files, shell, browser) stay off
  until you grant them.

## 5. Build

Press **Build** in the Build tab. MDT:

1. compiles your design into a **Blueprint**,
2. generates the application scaffold deterministically,
3. hands the blueprint to the **Codex** coding agent, which implements the
   design intent in an isolated workspace,
4. runs **typecheck, unit tests and end-to-end tests**; if something
   fails, Codex gets the real errors and fixes them (bounded retries),
5. applies the result only when everything is green (previous known-good
   state is one click away via **Rollback**).

## 6. Run the preview

The generated app runs as a real web application on your machine — open
the preview, type into your own UI, and watch your agent answer using the
capabilities you assigned.

## 7. Own your code

**Open source directory** takes you to the generated project: an ordinary
Vite + React + Node repository with README, tests and `.env.example`.
Copy it anywhere; it builds and runs without MDT. Nothing in the
generated app depends on MDT.

## Troubleshooting

- **Build says Codex unavailable** — install the CLI
  (`npm i -g @openai/codex`) and run `codex login`.
- **Agent answers fail with a provider error** — check the model policy
  (provider/model/base URL) and the API key in the generated app's `.env`.
- **A tool call fails with PERMISSION_DENIED** — you did not grant that
  scope to the capability; Agents tab → capability → grant.
- **Preview never gets healthy** — the Build panel shows the server's
  console tail; usually a port conflict or a broken `.env`.
