/**
 * MDT preload bridge (tasklist P10.06, P13.01): the ONLY surface the MDT
 * renderer gets for project IO, building and capabilities. Minimal,
 * typed, no Node primitives, no filesystem paths the renderer did not
 * already receive from a dialog/main call.
 */
import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'

const invoke = (channel: string, payload?: unknown): Promise<unknown> =>
  ipcRenderer.invoke(channel, payload)

const mdtApi = {
  createProject: (name: string) => invoke('mdt:project-create', { name }),
  openFileDialog: () => invoke('mdt:project-open-dialog'),
  openPath: (root: string) => invoke('mdt:project-open-path', { root }),
  save: (project: unknown) => invoke('mdt:project-save', { project }),
  autosave: (project: unknown) => invoke('mdt:project-autosave', { project }),
  saveAsDialog: (project: unknown) => invoke('mdt:project-save-as-dialog', { project }),
  state: () => invoke('mdt:project-state'),
  close: () => invoke('mdt:project-close'),
  recentList: () => invoke('mdt:recent-list'),
  recentRemove: (root: string) => invoke('mdt:recent-remove', { root }),
  recoveryCheck: (root: string) => invoke('mdt:recovery-check', { root }),
  recoveryDiscard: (root: string) => invoke('mdt:recovery-discard', { root }),

  capabilityList: () => invoke('mdt:capability-list'),
  designSlides: () => invoke('mdt:design-slides'),
  getVersion: () => invoke('app:get-version'),
  secretList: () => invoke('mdt:secret-list'),
  secretSet: (name: string, value: string) => invoke('mdt:secret-set', { name, value }),
  secretDelete: (name: string) => invoke('mdt:secret-delete', { name }),

  previewStart: (relative?: string) => invoke('mdt:preview-start', { relative }),
  previewStop: () => invoke('mdt:preview-stop'),
  previewState: () => invoke('mdt:preview-state'),

  buildStart: (task?: string) => invoke('mdt:build-start', { task }),
  buildCancel: () => invoke('mdt:build-cancel'),
  buildAvailability: () => invoke('mdt:build-availability'),
  buildRollback: () => invoke('mdt:build-rollback'),
  onBuildEvent: (handler: (payload: { buildId: string; event: unknown }) => void) => {
    const listener = (_e: IpcRendererEvent, payload: { buildId: string; event: unknown }) =>
      handler(payload)
    ipcRenderer.on('mdt:build-event', listener)
    return () => ipcRenderer.removeListener('mdt:build-event', listener)
  },
}

export type MdtApi = typeof mdtApi

contextBridge.exposeInMainWorld('mdtApi', mdtApi)
