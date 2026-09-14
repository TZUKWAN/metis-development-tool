/**
 * MDT project IO IPC (tasklist P05, P13.02).
 *
 * Every channel validates its payload with a Zod schema before touching
 * the filesystem — the renderer is untrusted. Filesystem work happens on
 * the main process only; the renderer never sees absolute paths it did not
 * already own (project path comes from open/save dialogs or recent list).
 */
import { app, dialog, ipcMain } from 'electron'

import { migrateProjectJson, parseProject, type ProjectRoot } from '@mdt/schema'
import {
  AutosaveController,
  RecentProjects,
  createProject,
  openProject,
  projectPaths,
  readRecoverySnapshot,
  saveProject,
  saveProjectAs,
  clearRecoverySnapshot,
  writeRecoverySnapshot,
  acquireLock,
  releaseLock,
} from '@mdt/project'
import { z } from 'zod'

import fs from 'node:fs'
import path from 'node:path'

export interface MdtIoRuntime {
  getWindow: () => Electron.BrowserWindow | undefined
  /** recent projects file inside userData */
  recentFile: string
}

interface Session {
  root: string
  project: ProjectRoot
  autosave: AutosaveController
}

let session: Session | undefined
let recent: RecentProjects | undefined

const OpenByPathArgs = z.object({ root: z.string().min(1) })
const CreateArgs = z.object({ name: z.string().min(1).max(120) })
const SaveArgs = z.object({
  project: z.custom<ProjectRoot>((v) => typeof v === 'object' && v !== null),
})

function recents(runtime: MdtIoRuntime): RecentProjects {
  recent ??= new RecentProjects(runtime.recentFile)
  return recent
}

function sessionError(message: string): { ok: false; error: string } {
  return { ok: false, error: message }
}

export function registerMdtIoIpc(runtime: MdtIoRuntime): void {
  ipcMain.handle('mdt:project-create', (_e, raw: unknown) => {
    const args = CreateArgs.parse(raw)
    const win = runtime.getWindow()
    if (!win) return sessionError('no window')
    const result = dialog.showSaveDialogSync(win, {
      title: 'New MDT Project',
      defaultPath: path.join(app.getPath('documents'), safeDirName(args.name)),
      properties: ['createDirectory', 'showOverwriteConfirmation'],
    })
    if (!result) return { ok: false, error: 'canceled' }
    const project = createProject(result, args.name)
    session = {
      root: result,
      project,
      autosave: new AutosaveController(result),
    }
    acquireLock(result, lockFor())
    recents(runtime).record(result, args.name)
    return { ok: true, project, root: result }
  })

  ipcMain.handle('mdt:project-open-dialog', async () => {
    const result = await dialog.showOpenDialog(runtime.getWindow()!, {
      title: 'Open MDT Project',
      properties: ['openDirectory'],
    })
    if (result.canceled || result.filePaths.length === 0) return { ok: false, error: 'canceled' }
    return openByRoot(runtime, result.filePaths[0])
  })

  ipcMain.handle('mdt:project-open-path', (_e, raw: unknown) => {
    const { root } = OpenByPathArgs.parse(raw)
    return openByRoot(runtime, root)
  })

  ipcMain.handle('mdt:project-save', (_e, raw: unknown) => {
    const args = SaveArgs.parse(raw)
    if (!session) return sessionError('no project open')
    const parsed = parseProject(args.project)
    if (!parsed.ok) return { ok: false, error: 'project failed validation', issues: parsed.issues }
    session.project = parsed.project
    try {
      saveProject(session.root, parsed.project)
      session.autosave.markSaved()
      clearRecoverySnapshot(session.root)
      return { ok: true, savedAt: new Date().toISOString() }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })

  ipcMain.handle('mdt:project-autosave', (_e, raw: unknown) => {
    const args = SaveArgs.parse(raw)
    if (!session) return sessionError('no project open')
    const parsed = parseProject(args.project)
    if (!parsed.ok) return { ok: false, error: 'project failed validation' }
    session.project = parsed.project
    session.autosave.touch(parsed.project)
    writeRecoverySnapshot(session.root, parsed.project)
    return { ok: true }
  })

  ipcMain.handle('mdt:project-save-as-dialog', async (_e, raw: unknown) => {
    const args = SaveArgs.parse(raw)
    if (!session) return sessionError('no project open')
    const parsed = parseProject(args.project)
    if (!parsed.ok) return { ok: false, error: 'project failed validation' }
    const result = await dialog.showOpenDialog(runtime.getWindow()!, {
      title: 'Choose destination directory',
      properties: ['openDirectory', 'createDirectory'],
    })
    if (result.canceled || result.filePaths.length === 0) return { ok: false, error: 'canceled' }
    const dest = path.join(result.filePaths[0], path.basename(session.root))
    saveProjectAs(session.root, dest, parsed.project)
    session = { root: dest, project: parsed.project, autosave: new AutosaveController(dest) }
    recents(runtime).record(dest, parsed.project.name)
    return { ok: true, root: dest }
  })

  ipcMain.handle('mdt:project-state', () => {
    if (!session) return { ok: false, error: 'no project open' }
    return {
      ok: true,
      root: session.root,
      project: session.project,
      dirty: session.autosave.state.dirty,
      lastError: session.autosave.state.lastError ?? null,
    }
  })

  ipcMain.handle('mdt:project-close', () => {
    if (session) {
      releaseLock(session.root, lockFor())
      session.autosave.dispose()
      session = undefined
    }
    return { ok: true }
  })

  ipcMain.handle('mdt:recent-list', () => {
    return { ok: true, entries: recents(runtime).pruneExisting() }
  })

  ipcMain.handle('mdt:recent-remove', (_e, raw: unknown) => {
    const { root } = OpenByPathArgs.parse(raw)
    recents(runtime).remove(root)
    return { ok: true }
  })

  ipcMain.handle('mdt:recovery-check', (_e, raw: unknown) => {
    const { root } = OpenByPathArgs.parse(raw)
    const snapshot = readRecoverySnapshot(root)
    return { ok: true, snapshot }
  })

  ipcMain.handle('mdt:recovery-discard', (_e, raw: unknown) => {
    const { root } = OpenByPathArgs.parse(raw)
    clearRecoverySnapshot(root)
    return { ok: true }
  })
}

function openByRoot(
  runtime: MdtIoRuntime,
  root: string,
): {
  ok: boolean
  error?: string
  project?: ProjectRoot
  root?: string
  issues?: unknown
  migration?: { fromVersion: number }
  lockedBy?: unknown
} {
  const abs = path.resolve(root)
  if (!fs.existsSync(projectPaths(abs).projectFile)) {
    return { ok: false, error: 'not an MDT project directory' }
  }
  const lock = acquireLock(abs, lockFor())
  if (!lock.ok)
    return {
      ok: false,
      error: 'project is already open in another MDT window',
      lockedBy: lock.heldBy,
    }
  const opened = openProject(abs)
  if (!opened.parse.ok) {
    releaseLock(abs, lockFor())
    return { ok: false, error: opened.parse.error, issues: opened.parse.issues }
  }
  let project = opened.parse.project
  const migrated = migrateProjectJson(JSON.parse(JSON.stringify(project)))
  if (migrated.ok && typeof migrated.data === 'object') {
    const validated = parseProject(migrated.data)
    if (validated.ok) project = validated.project
  }
  session = { root: abs, project, autosave: new AutosaveController(abs) }
  recents(runtime).record(abs, project.name)
  return { ok: true, project, root: abs }
}

function lockFor() {
  return { pid: process.pid, host: 'localhost', acquiredAt: new Date().toISOString() }
}

function safeDirName(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, '-').slice(0, 80)
}

export function getMdtSession(): Session | undefined {
  return session
}
