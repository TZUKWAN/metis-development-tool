/**
 * Preview IPC (tasklist P12.02, P12.03, P12.05): start/stop/restart the
 * generated app's dev server from the renderer, with console tail access.
 * The workspace path is validated to live inside the open project.
 */
import { ipcMain } from 'electron'

import path from 'node:path'

import { z } from 'zod'

import { PreviewManager } from '@mdt/preview'

import { getMdtSession } from './mdt-io'

const manager = new PreviewManager()

const StartArgs = z.object({ relative: z.string().default('generated') })
export function registerMdtPreviewIpc(): void {
  ipcMain.handle('mdt:preview-start', async (_e, raw: unknown) => {
    const args = StartArgs.parse(raw ?? {})
    const session = getMdtSession()
    if (!session) return { ok: false, error: 'no project open' }
    const workspace = path.resolve(session.root, args.relative)
    if (!workspace.startsWith(path.resolve(session.root))) {
      return { ok: false, error: 'preview workspace must be inside the project' }
    }
    try {
      const info = await manager.start({ workspaceDir: workspace, readyTimeoutMs: 90_000 })
      return { ok: true, ...info }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })

  ipcMain.handle('mdt:preview-stop', async () => {
    await manager.stop()
    return { ok: true }
  })

  ipcMain.handle('mdt:preview-state', () => {
    return { ok: true, info: manager.current ?? null, console: manager.consoleTail.slice(-200) }
  })
}

export function previewUrl(): string | undefined {
  return manager.current?.url
}
