import { BrowserWindow, app } from 'electron'
import path from 'node:path'

import { CapabilityRegistry, registerBuiltins } from '@mdt/capabilities'
import { generateAndWrite } from '@mdt/generator'
import { toBuildBlueprint, type ProjectRoot } from '@mdt/schema'
import { attachBuildEvents, registerMdtBuildIpc } from './mdt-builder'
import { registerMdtAppPrefsIpc } from './mdt-app-prefs'
import { registerMdtCapabilityIpc, registerMdtSecretIpc } from './mdt-capabilities-ipc'
import { registerMdtIoIpc } from './mdt-io'
import { registerMdtPreviewIpc } from './mdt-preview-ipc'
import { registerMdtThumbnailsIpc } from './mdt-thumbnails'
import { sessions } from './session-state'
import { startSlidesStandalone } from './slides-main'

// MDT surface: project IO, builder lifecycle (P05/P10). Registered before
// the deck runtime so the welcome screen can open projects as soon as the
// renderer boots.
registerMdtIoIpc({
  getWindow: () => BrowserWindow.getAllWindows()[0],
  recentFile: path.join(app.getPath('userData'), 'mdt-recent.json'),
})
registerMdtCapabilityIpc()
registerMdtAppPrefsIpc()
registerMdtSecretIpc()
registerMdtPreviewIpc()
// interaction-canvas page thumbnails (P07.03): the sessions map is injected
// the same way registerSlidesIpc hands it to registerMdtDesignIpc
registerMdtThumbnailsIpc(sessions)
registerMdtBuildIpc({
  // the generated workspace lives inside the project directory
  projectsRoot: () => undefined,
  generate: async (project, workspaceRoot, projectRoot) => {
    // build-start has already schema-parsed the project document
    const blueprint = toBuildBlueprint(project as ProjectRoot)
    const registry = registerBuiltins(new CapabilityRegistry())
    const result = generateAndWrite(blueprint, {
      capabilityManifests: new Map(registry.manifests().map((m) => [m.id, m])),
      outDir: workspaceRoot,
      ...(projectRoot ? { projectRoot } : {}),
    })
    return { ok: true, files: result.files.length, warnings: result.warnings }
  },
})
// builder events stream to the focused window's webContents
app.whenReady().then(() => {
  const attach = (win: BrowserWindow) => attachBuildEvents(win.webContents)
  BrowserWindow.getAllWindows().forEach(attach)
  app.on('browser-window-created', (_e, win) => attach(win))
})

startSlidesStandalone()
