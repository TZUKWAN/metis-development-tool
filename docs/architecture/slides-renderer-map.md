# GenOffice Slides Renderer Map (baseline `e064f3a`)

> Audit performed 2026-09-15 for MDT task P02.07. All paths relative to repo
> root under `apps/slides/src` unless noted.

Architecture in one line: the renderer is a pure view — the authoritative
deck model (`OpenedPptx` from `@genoffice/pptx-engine`) lives in the Electron
main process; every edit is an IPC op that mutates the model and returns a
fresh immutable `RenderSlide[]` tree (types from `@genoffice/pptx-render`)
which the renderer swaps into React state.

## State source

- **No reducer/zustand/context store.** All state is `useState` in the root
  component `App` (`apps/slides/src/renderer/App.tsx`, ~4315 lines). Key
  declarations: `slides`/`setSlides` (App.tsx:310), `current` (354),
  `selectedIds` (355), `enteredGroupId` (357), `editing`/`editingCell`
  (358-359), `zoom` (366), `dirty` (373),
  `images: Map<string, HTMLImageElement>` (443), `animations` (455),
  `sections` (477), `slideShow`/`presenter` (492-494), AI state
  `showAi`/`aiSettings`/`editQueue` (426-430, 361).
- **ActionCtx pattern:** extracted action modules (keyboard-actions,
  clipboard-actions, file-actions, slide-actions, insert-actions,
  arrange-actions, show-actions, animation-actions, picture-edit-actions,
  table-actions) receive a state bundle `ActionCtx` defined in
  `apps/slides/src/renderer/action-context.ts:98`. App rebuilds it every
  render into `ctxRef.current` and exposes stable
  `useCallback(() => impl(ctxRef.current, ...))` wrappers.
- **Selection model:** flat `string[]` of element `sourceId`s (`selectedIds`,
  App.tsx:355) plus `enteredGroupId: string | null` for in-group editing
  (357). Node lookup helper `findNodeCtx` (App.tsx:826) resolves a node
  against the current slide or the entered group's children and returns
  `{ node, groupId? }`. On canvas, selection is realized by a single Konva
  `Transformer` attached in a `useEffect`
  (`apps/slides/src/renderer/SlideCanvas.tsx:729-730`, `trRef` at 550).
- **Undo/redo lives in the main process**, per-window "session":
  - `apps/slides/src/main/session-state.ts` — `Session` interface (line 50),
    `sessions: Map<number, Session>` (79), `takeSnapshot` (133),
    `restoreSnapshot` (291), `pushHistory` (215),
    `beginHistoryBatch`/`endHistoryBatch` (223/241, coalesces multi-op
    gestures), `scheduleHistoryNotify` (156, pushes canUndo/canRedo to the
    renderer), AI-specific `registerAiSnapshot`/`restoreAiSnapshot`
    (273/282).
  - Handlers `slides:undo` / `slides:redo` in
    `apps/slides/src/main/slides-main.ts:3984` / `:3997` — pop/push
    snapshots via `takeSnapshot`/`restoreSnapshot`, then
    `buildAllRenderSlides` and broadcast.
  - Renderer side: `undo()`/`redo()` callbacks in App.tsx:989/999 call
    `window.slidesApi.undo()` and apply via `applyHistoryResult`
    (App.tsx:976); `undo-routing.ts` (`isTextUndoTarget`,
    `shouldRouteUndoToDeck`) decides when Ctrl+Z goes to a DOM input vs the
    deck; `onHistoryChanged` greys the QAT buttons (App.tsx:871-873). Every
    mutating IPC handler pushes history (`pushHistory(session)` calls
    throughout slides-main.ts, e.g. 1150, 1220, 1491) and pops it on failure
    (`session.undoStack.pop()`, e.g. 1272, 1494).
- **Multi-window sync:** `onDeckChanged` broadcast applies another window's
  edits (App.tsx:878-888); dirty tracking via `slides:is-dirty`
  (slides-main.ts:4009, checks `structureDirty`/`el.dirty`/`dirtyTransform`).

## Render pipeline

- **Entry:** `apps/slides/src/renderer/main.tsx` — `bootstrap()` fetches
  lang/theme via `window.slidesApi`, mounts `<App />` (or `<AudienceView />`
  for `?mode=audience`) inside `LocaleProvider`; preloads Carlito @font-face
  for Konva (lines 21-26); imports `@genoffice/ui` CSS token sheets
  (lines 8-16).
- **Canvas:** `SlideCanvas` (`apps/slides/src/renderer/SlideCanvas.tsx:525`,
  ~2011 lines) — react-konva `Stage/Layer` per current slide; a single
  shared `Transformer` (line 1229) with counter-scaled chrome
  (`applyChromeZoom`, 420); zoom has a `settledZoom` debounce so gestures
  don't re-raster per frame (574-579); pixel-ratio adapts to node count
  (`canvasPixelRatio`, 399; `DENSE_SLIDE_NODE_COUNT` 300 at 374); marquee
  select (`onMouseDown`/`onMouseMove` 788/819), connector endpoint handles
  (`ConnectorEndpointHandles`, 1360), freehand draw commit, adjust handles
  (`AdjustHandles`, 447). Imperative handle `SlideCanvasHandle.startNodeDrag`
  (263/554) lets App start drags programmatically. Per-node rendering
  delegates to `NodeBody` (interactive) and `StaticNode` (read-only) in
  `apps/slides/src/renderer/NodeBody.tsx:71` / `:1135`; Konva primitives are
  produced from the model by `apps/slides/src/renderer/konva-adapter.ts`
  (`fillToKonva` etc., ~1802 lines).
- **Thumbnails:** `SlideThumb` (`apps/slides/src/renderer/SlideThumb.tsx:17`)
  — a memoized, non-listening mini Konva `Stage` reusing `StaticNode`, so
  thumbs always match the canvas. No disk cache; memoization is the cache
  (re-renders avoided via `React.memo`; layer redraw on late font loads,
  lines 35-41). Used in: left sidebar (App.tsx:3415), slide sorter (3344),
  reading view (3295), master view (`apps/slides/src/renderer/MasterView.tsx:232`).
  The same component doubles as the **offscreen export renderer**:
  `renderSlidesToPngBase64` in `apps/slides/src/renderer/export-render.tsx:21`
  mounts `SlideThumb` into an offscreen DOM container and captures
  `stage.toDataURL` (2x pixel ratio; pixelRatio 1 for AI-vision screenshots).
  `apps/slides/src/renderer/headless-export.ts` drives the same path for
  CLI/headless PNG+PDF export (`slides:consume-headless-export` /
  `slides:headless-export-done` channels).
- **Text editing:** `TextEditOverlay`
  (`apps/slides/src/renderer/TextEditOverlay.tsx:603`, ~1586 lines) — a
  `contentEditable` DOM div stacked over the Konva text node (canvas hides
  that node's text while editing; header comment line 2). Flow: `startEdit`
  sets `editing` state → overlay positions via `pressOnEditFrame` (47) and
  `populateEditorDom` (314); caret placement with
  `document.caretRangeFromPoint` (708); on commit, `extractParagraphs`
  (1020) walks the DOM into `EditParagraph[]`; `App.commitEdit`
  (App.tsx:2310) sends it to `window.slidesApi.editText` → channel
  `slides:edit-text` (slides-main.ts:1217) which mutates the model, pushes
  history (1220) and returns the updated `RenderSlide` that App splices into
  `setSlides`. Live-formatting queries (`liveAlign`, `liveBulletChar`,
  `liveRtl`, `applySelectionFontFamily`, `resizeSelectionFont`) are exported
  from TextEditOverlay.tsx:1387-1551 and drive ribbon state during editing.
  Table cell editing uses `commitCellEdit` (App.tsx:2300) → table-actions.

## Keyboard / clipboard

- **Shortcuts:** `handleGlobalKeydown` in
  `apps/slides/src/renderer/keyboard-actions.ts:23` — attached exactly once
  in App (`window.addEventListener('keydown', onKey)`, App.tsx:1007-1010)
  reading latest state through ctxRef. Covers F5/⌘Enter (show),
  ⌘Z/⌘⇧Z/Ctrl+Y, ⌘F, ⌘K (AI ask popover, line 75), ⌘P, zoom, ⌘C/X/V
  (+⌘⇧C/⌘⇧V format painter), ⌘D, ⌘G/⌘⇧G, Delete, arrows nudge, Tab
  selection cycling, ⌘A, type-to-edit. Reading view installs a capture-phase
  handler (App.tsx:1931-1952). Menu-accelerator commands arrive separately
  and are dispatched in App.tsx:2105-2145; labels/accelerators come from
  `platformShortcuts` in `@genoffice/i18n`
  (`apps/slides/src/renderer/components/ContextMenu.tsx:6`,
  `components/RibbonHomeTab.tsx:3`).
- **Clipboard:** `apps/slides/src/renderer/clipboard-actions.ts`
  (`copySelected`, `cutSelected`, `pasteClipboard`, `duplicateSelected`,
  `deleteSelected`, `copySlideAt`, `repasteSlideAs`, `insertExternalImage`,
  `copyFormat`/`pasteFormat`/`applyBrushToElement`). Element/slide clipboard
  state lives in the main process: channels `slides:copy-elements`/
  `paste-elements`/`duplicate-elements` (slides-main.ts:3173/3190/3218),
  `slides:copy-slide`/`paste-slide`/`repaste-slide` (2380/2421/2439, with
  in-memory `slideClipboard`), `slides:clipboard-probe`/`clipboard-external`
  (3166/3154) for OS-clipboard images; text-editing contexts deliberately
  use the native clipboard (`window.slidesApi.nativeClipboard(...)`,
  App.tsx:2126-2135). Paste-options floater state: `pasteFloater`
  (App.tsx:1469).

## File load/save (renderer entry → IPC → main)

- **Open:** `App.openDialog` (App.tsx:845-848) →
  `window.slidesApi.openPptx(FIT_WIDTH)` → preload
  `apps/slides/src/preload/index.ts:136` → channel `slides:open`
  (slides-main.ts:1159; also `slides:open-path` 1171 for OS file
  associations, `slides:consume-pending-open` 1177, `slides:new-blank`
  1922). Results applied by `applyOpen`. Renderer image cache:
  `createImageLoader` (`apps/slides/src/renderer/image-loader.ts`), `images`
  map in state.
- **Save:** `apps/slides/src/renderer/file-actions.ts` — `save` (78,
  serialized by the module-level `saveTail` promise chain / `runSerialized`
  56 to prevent interleaved zip writes), `saveAs` (103), `flushActiveEdit`
  (17), `adoptSavedSlides` (30, remaps selection after save because the main
  process rebakes element ids). Channels: `slides:save` (slides-main.ts:4020
  — drafts-dir fallback for untitled, `savePptxToFile`, then `commitSaved`
  bakes patches so no full re-unzip) and `slides:save-as` (4052). Auto-save:
  30s + on blur when enabled (`slides:autosave-pref` 558, `autosaveBackoff`,
  drafts/recovery via `dropUntitledRecovery`), close-guard via
  `onCloseSaveRequest`/`reportCloseSaveResult` (App.tsx:862-869,
  `slides:close-save-result` 562).
- **Export:** `exportImages` / `exportPdf` (file-actions.ts:135/168) render
  PNGs offscreen via export-render.tsx then hit `slides:pick-export-dir`
  (4083), `slides:export-images` (4094), `slides:pick-export-pdf-path`
  (4113), `slides:export-pdf` (4124, main prints PNGs to PDF via printToPDF
  in a hidden window). Print preview lives in
  `components/PrintDialog.tsx` + `shared/print-html.ts`.

## AI panel (what a removal touches)

Renderer feature files:

- `apps/slides/src/renderer/ai/AiPanel.tsx` (~3086 lines) — chat UI; runs
  `AgentLoop` + `composeSkills` from `@genoffice/agent-core`, capability
  flags from `@genoffice/ai-provider/browser`, attachments, tool-activity
  rendering.
- `ai/slides-skill.ts` (~2505 lines) — `createSlidesSkill`: deck tools plus
  outline→deck generation; imports `@genoffice/pptx-ops/op-docs` and
  `@genoffice/pipelines/slides/layout-audit`; embeds
  `ai/prompts/system.md` via `?raw`.
- `ai/edit-queue.ts` + `ai/EditQueueCard.tsx` — queued selection-scoped
  edits (`EditQueueItem`, `buildSelectionInstruction`, `resolveQueue`).
- `ai/transport.ts` — `createElectronTransport` bridging `AgentTransport` to
  `window.slidesApi.aiStream/onAiStream/aiStreamCancel`.
- `ai/files-skill.ts`, `ai/outline-json.ts`, `ai/slide-qc.ts` (vision QC),
  `ai/layout-script.ts` + `ai/layout-script-interpreter.ts`, `ai/prompts/*.md`.
- Components: `components/AiAskPopover.tsx` (⌘K annotation popover),
  undo-routing attributes `data-slides-ai-input`/`data-deck-undo-ready`
  (undo-routing.ts:20).
- App wiring to strip: imports App.tsx:80-84 (`AiPanel`, `AiAskPopover`,
  edit-queue), state `aiPanelKey`/`showAi`/`aiSettings`/`aiPreset`/
  `editQueue` (351, 361, 426-430), `openAskPopover` in ActionCtx
  (action-context.ts:182), ⌘K branch (keyboard-actions.ts:75-80).
- Main/preload side: `apps/slides/src/main/ai-ipc.ts` (channels
  `ai:get-settings`, `ai:set-settings`, `ai:gsk-login`, `ai:stream`,
  `ai:stream-cancel`, `ai:web-search`, `ai:image-search`, `ai:log-run-failure`;
  imports `@genoffice/ai-provider`, `@genoffice/ai-search`,
  `@genoffice/pptx-engine`, `@genoffice/pptx-render`,
  `@genoffice/pipelines/slides`), `apps/slides/src/main/attachments-ipc.ts`
  (`@genoffice/file-parse` text extraction), cloud page generation in
  slides-main.ts (`slides:cloud-gen-status` 1588, `slides:cloud-page-generate`,
  `slides:local-page-generate`, `slides:ai-snapshot-restore` 3976, using
  `gskSlideGenerate` from `@genoffice/ai-search` at slides-main.ts:30), and
  the preload surface (preload/index.ts:158-169 + `aiStream`/`onAiStream`).

Removing the AI feature orphans the `ai-provider`, `ai-search`,
`agent-core`, `file-parse` packages for slides and the `pipelines/slides`
deep imports from ai-ipc (`slides-main.ts:58` uses pipelines for non-AI
page-spec parsing too — keep pipelines).
