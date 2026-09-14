/**
 * MDT app-level preference handlers (P03.04): in the standalone app these
 * channels previously belonged to the removed shell — MDT now owns them.
 * Theme: 'system' (renderer applies prefers-color-scheme); auto-save: on.
 */
import { ipcMain } from 'electron'

export function registerMdtAppPrefsIpc(): void {
  ipcMain.removeHandler?.('app:get-theme')
  ipcMain.handle('app:get-theme', () => 'system')
  ipcMain.removeHandler?.('app:get-auto-save-default')
  ipcMain.handle('app:get-auto-save-default', () => true)
}
