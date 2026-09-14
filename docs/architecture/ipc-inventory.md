# GenOffice Slides + Shell IPC Inventory (baseline `e064f3a`)

> Audit performed 2026-09-15 for MDT task P02.08. Line numbers verified
> against the working tree. Slides runs standalone
> (`apps/slides/src/main/index.ts:1-3` → `startSlidesStandalone()`) or
> hosted as a `WebContentsView` inside the shell
> (`apps/slides/src/main/slides-main.ts:4487-4506`, wired at
> `apps/shell/src/main/index.ts:319` via `configureSlidesRuntime`).

## 1. Preload exposure surface (contextBridge)

| Bridge object                 | App            | Exposed at                                                                                                                                                  | Contents                                                                                         |
| ----------------------------- | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `window.slidesApi`            | slides         | `apps/slides/src/preload/index.ts:440`                                                                                                                      | all `slides:*` and `ai:*` channels + push-event subscriptions                                    |
| `window.desktop`              | slides         | `apps/slides/src/preload/index.ts:443-454`                                                                                                                  | attachment bridge (`slides:files-*`, `webUtils.getPathForFile` line 451)                         |
| `window.projectApi`           | slides         | `apps/slides/src/preload/index.ts:456-469`                                                                                                                  | `project:resolveChat/appendChat/loadChat/rebindChat/list/create/rename/delete/moveFile/timeline` |
| drop-open bridge              | slides + shell | `apps/slides/src/preload/index.ts:472`, `apps/shell/src/preload/index.ts:457` via `installDropOpenBridge()` (`packages/electron-utils/src/drop-open.ts:18`) | preload-world only; **not** on contextBridge                                                     |
| `window.aiOffice`             | shell          | `apps/shell/src/preload/index.ts:349`                                                                                                                       | home/recent/settings/AI-test/account/tabs channels                                               |
| `window.aiOfficeProject`      | shell          | `apps/shell/src/preload/index.ts:351-384`                                                                                                                   | project channels                                                                                 |
| `window.aiOfficeIntegrations` | shell          | `apps/shell/src/preload/index.ts:386-414`                                                                                                                   | skill install/uninstall/pick/save/copyText                                                       |
| `window.aiOfficeTabs`         | shell          | `apps/shell/src/preload/index.ts:416-454`                                                                                                                   | tab strip management                                                                             |
| `window.aiOfficeUpdate`       | shell          | `apps/shell/src/preload/update.ts:25`                                                                                                                       | `update:*`                                                                                       |
| `window.aiOfficePdfPassword`  | shell          | `apps/shell/src/preload/pdf-password.ts:24`                                                                                                                 | `pdf-password:*`                                                                                 |

Slides preload runtime dependencies: only `electron` and
`@genoffice/electron-utils/drop-open` (`apps/slides/src/preload/index.ts:2,6`);
everything else is `import type` and erased at build. Shell preload **does**
have a runtime import of `@genoffice/ai-provider/browser`
(`apps/shell/src/preload/index.ts:3-9`).

## 2. HIGH-risk channels (slides)

### File/export

| Channel                | Main file:line                         | Risk reason                                                                                                                       |
| ---------------------- | -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `slides:export-images` | slides-main.ts:4094 (writes 4100-4104) | **HIGH** — writes N PNG files to a renderer-supplied `op.dir` with no re-validation (only unvalidated fs-write channel in slides) |

### Fonts

| Channel                | Main file:line                                                           | Risk reason                                                                                                 |
| ---------------------- | ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| `slides:font-download` | slides-main.ts:1096 → `font-store.ts:84` (`net.fetch`) + `writeFileSync` | **HIGH** — network egress to CDN + writes into userData font store (sha256-verified, `font-store.ts:78-82`) |

### Clipboard

| Channel                     | Main file:line                                                 | Risk reason                 |
| --------------------------- | -------------------------------------------------------------- | --------------------------- |
| `slides:clipboard-external` | slides-main.ts:3154 (`clipboard.readImage/readText` 3158-3160) | **HIGH** (clipboard access) |
| `slides:clipboard-probe`    | slides-main.ts:3166 (`clipboard.readBuffer/readText` 3170)     | **HIGH**                    |
| `slides:native-clipboard`   | slides-main.ts:3956                                            | **HIGH** (write)            |

### AI family (all HIGH — network/credential egress)

`ai:get-settings` (ai-ipc.ts:110, returns BYOK apiKey), `ai:set-settings`
(:133, persists API keys **plaintext** to `userData/ai-settings.json`),
`ai:gsk-status` (:119), `ai:gsk-login` (:129, `shell.openExternal`),
`ai:stream` (:141, main-process LLM egress), `ai:stream-chunk` (push :152),
`ai:web-search` (:225), `ai:image-search` (:237), `ai:generate-image`
(:257), `ai:analyze-media` (:285), `ai:insert-image-url` (:300, SSRF-
hardened fetch), `ai:replace-picture-url` (:364).

### Cloud generation

`slides:cloud-page-generate` (slides-main.ts:1590-1638, gsk cloud egress +
temp writes), `slides:local-page-generate` (:1640-1694, URL fetches,
SSRF-hardened).

### Attachments (`window.desktop`)

| Channel                                                      | Main file:line             | Risk reason                                                                                                                       |
| ------------------------------------------------------------ | -------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `slides:files-read`                                          | attachments-ipc.ts:172-201 | **HIGH** — reads any path matching an extension allowlist (≤50 MB) and hands content to renderer/AI chain; renderer-supplied path |
| `slides:files-read-image`                                    | attachments-ipc.ts:204-218 | **HIGH** — arbitrary image read (≤5 MB) → base64 to renderer                                                                      |
| `slides:files-pick` / `files-add` / `files-add-pasted-image` | 155-168 / 170 / 221-229    | MEDIUM/LOW                                                                                                                        |

## 3. LOW-risk channels

Uniform family of ~110 deck-edit channels (`slides:edit-text`,
`slides:add-element`, `slides:group-elements`, table ops, master ops,
undo/redo, history batches, sections, animations, …) — all
`ipcMain.handle` on the in-memory pptx model, no fs/net. Full enumeration
was captured during the audit; representative lines:
`slides:edit-text` slides-main.ts:1217/preload:170; `slides:add-element`
1934/218; `slides:group-elements` 2074/213; `slides:undo` 3984/317;
`slides:redo` 3997/318; `slides:history-batch-begin/end` 3962/3969;
`slides:apply-txn` 1461/315.

Push channels: `slides:menu` (4521), `slides:opened` (4462, 4687),
`slides:renamed` (413, 472), `slides:close-save-request` (580),
`slides:history-changed` (session-state.ts:164), `slides:deck-changed`
(session-state.ts:210), `app:*` language/theme prefs
(slides-main.ts:1050+; shell index.ts:3167+), presenter sync
(presenter-show.ts:104-155).

## 4. Shell HIGH-risk channels

| Channel(s)                                                      | Main file:line                                                                           | Risk                                                                                       |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `home:delete-files`                                             | shell index.ts:3134-3147                                                                 | deletes arbitrary renderer-supplied paths (to Trash)                                       |
| `home:open-*` (genteam/credit/github/cloud)                     | 3273-3290, 3335-3339                                                                     | `shell.openExternal`                                                                       |
| `home:account-*`                                                | 2932-2978                                                                                | credentials/token access + device-code auth flow                                           |
| `home:cloud-projects*`                                          | 3329-3339 → cloud-projects.ts:3                                                          | network sync via gsk CLI                                                                   |
| `integrations:install/uninstall-skill`                          | integrations-ipc.ts:67-88 → agent-skills.ts:193                                          | writes/deletes in external agent skill dirs (`~/.claude/skills` etc.)                      |
| `integrations:copy-text`                                        | integrations-ipc.ts:121-123                                                              | clipboard write                                                                            |
| `update:*`                                                      | update-window.ts:31-97                                                                   | downloads and installs app binaries                                                        |
| `pdf-password:submit`                                           | pdf-password-dialog.ts:30-46                                                             | document password transits IPC                                                             |
| `ai:chat`, `ai:codex-models`, `ai:search-test`, `ai:media-test` | docs-main.ts:2985/2823/2964/2973 (registered in shell process, shell index.ts:4322-4323) | LLM egress; **spawns codex CLI** (also `packages/ai-provider/src/codex-app-server.ts:283`) |

## 5. BrowserWindow / webPreferences / CSP

No `webSecurity`, `enableRemoteModule`, `nodeIntegrationInWorker`, or
`experimentalFeatures` overrides exist anywhere in slides or shell;
`webSecurity` defaults to `true` everywhere. Electron 43. No remote module.

| Window                    | File:line                    | webPreferences                                                                                   |
| ------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------ |
| Slides standalone editor  | slides-main.ts:4414-4431     | preload 4426, `contextIsolation: true` 4427, `nodeIntegration: false` 4428, `sandbox: true` 4429 |
| Slides tab (shell-hosted) | slides-main.ts:4488-4496     | same four flags 4490-4495                                                                        |
| Headless export window    | slides-main.ts:4375-4386     | sandbox 4383, backgroundThrottling false 4384                                                    |
| Hidden PDF-export window  | slides-main.ts:4127          | `{ sandbox: true }`                                                                              |
| Presenter/audience window | presenter-show.ts:72-83      | sandbox 81                                                                                       |
| Shell main window         | shell index.ts:2393-2416     | sandbox 2415                                                                                     |
| PDF password dialog       | pdf-password-dialog.ts:72-89 | sandbox 89                                                                                       |
| Update dialog             | update-window.ts:53-70       | sandbox 70                                                                                       |

CSP (meta http-equiv; all renderers are local `genoffice-app://` origins):

- Slides renderer `apps/slides/src/renderer/index.html:6-9`:
  `default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self'
'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data: blob:;
media-src 'self' data: blob:; worker-src 'self' blob:; connect-src 'self'
ws://localhost:*` — **no remote connect-src**: all network egress is
  proxied through main via `ai:*`.
- Shell home `apps/shell/src/renderer/index.html:6-8`; update
  `update.html:6`; pdf-password `pdf-password.html:6`; print windows:
  generated CSP in `packages/electron-utils/src/print-html-pdf.ts:163`.

## 6. Navigation / windows / protocols

- Custom privileged scheme `genoffice-app`:
  `packages/electron-utils/src/renderer-scheme.ts:5-21` (standard, secure,
  supportFetchAPI, corsEnabled, stream, codeCache). Registered slides
  slides-main.ts:4653, shell docs-main.ts:4617; handler slides-main.ts:4698,
  shell index.ts:4388-4396. Path escape → 404 (renderer-scheme.ts:37-40).
- `will-navigate`: default-deny for every webContents —
  `packages/electron-utils/src/navigation-guard.ts:21-31` (preventDefault
  unless same-URL reload; default-deny `setWindowOpenHandler`). Installed
  slides-main.ts:4654, shell index.ts:4320, docs-main.ts:4618.
- `setWindowOpenHandler`: slides routes `window.open` to system browser via
  `safeExternalUrl` allowlist (`packages/electron-utils/src/safe-external-url.ts:21-29`)
  — slides-main.ts:362-371. All others keep deny-all.
- Permission handlers: none registered (`setPermissionRequestHandler` — no
  hits); sandboxed renderers + `'self'`-only CSP are the containment.
- Freeze diagnostics: on renderer `unresponsive`, main writes diagnostics;
  macOS shells to `/usr/bin/sample` via `execFile`
  (slides-main.ts:311-334, exec at 332) — the only child-process exec in
  slides main; not renderer-triggerable.
- Codex CLI app-server spawn: `@genoffice/ai-provider/codex-app-server`
  spawns codex CLI (codex-app-server.ts:283); slides registers
  `app.once('before-quit', shutdownCodexAppServers)` (ai-ipc.ts:105).

## Key risk summary (slides attack surface)

1. Highest-value HIGH channels: the AI proxy set (`ai:stream`,
   `ai:web-search/image-search`, `ai:generate-image/analyze-media`,
   `ai:insert-image-url/replace-picture-url`) — main-process network egress
   reachable from a compromised renderer (URL fetches SSRF-hardened,
   genspark key kept out of settings/renderer, ai-ipc.ts:147-149).
2. Arbitrary-file-read primitives by design for chat attachments
   (`slides:files-read`, `slides:files-read-image`) — extension allowlist +
   size caps are the only barrier.
3. `slides:export-images` writes renderer-controlled paths (4094-4104) —
   the only unvalidated fs-write channel in slides.
4. Clipboard fully brokered through main; no `clipboard` exposure to
   renderer.
5. Containment posture is strong: sandbox+contextIsolation everywhere, CSP
   without remote connect-src, default-deny navigation, external URL
   allowlisting.

**MDT implications (P13 groundwork):** removing the GenOffice AI family
eliminates nearly all HIGH network/credential channels; MDT replaces them
with its own validated IPC surface (schema-validated payloads per P13.02);
`slides:export-images`-style unvalidated writes must not be replicated in
new MDT channels; the codex-app-server spawn machinery in
`packages/ai-provider/src/codex-app-server.ts` is prior art for ADR-0005's
app-server integration.
