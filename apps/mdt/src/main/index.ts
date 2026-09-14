import { BrowserWindow, app } from 'electron'
import path from 'node:path'

import { attachBuildEvents, registerMdtBuildIpc } from './mdt-builder'
import { registerMdtCapabilityIpc, registerMdtSecretIpc } from './mdt-capabilities-ipc'
import { registerMdtIoIpc } from './mdt-io'
import { startSlidesStandalone } from './slides-main'

// MDT surface: project IO, builder lifecycle (P05/P10). Registered before
// the deck runtime so the welcome screen can open projects as soon as the
// renderer boots.
registerMdtIoIpc({
  getWindow: () => BrowserWindow.getAllWindows()[0],
  recentFile: path.join(app.getPath('userData'), 'mdt-recent.json'),
})
registerMdtCapabilityIpc()
registerMdtSecretIpc()
registerMdtBuildIpc({
  // the generated workspace lives inside the project directory
  projectsRoot: () => undefined,
  // wired to @mdt/generator at build assembly (P11); until then builds
  // surface a loud generation failure instead of pretending to succeed
  generate: async () => ({
    ok: false,
    error: 'MDT generator is not wired into this build of the app',
  }),
})
// builder events stream to the focused window's webContents
app.whenReady().then(() => {
  const attach = (win: BrowserWindow) => attachBuildEvents(win.webContents)
  BrowserWindow.getAllWindows().forEach(attach)
  app.on('browser-window-created', (_e, win) => attach(win))
})

startSlidesStandalone()
