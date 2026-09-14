/**
 * Capability registry IPC (P09.03/P09.04) + secret store (P09.06).
 *
 * The renderer must NOT import @mdt/capabilities (its adapters use Node
 * APIs); manifests cross IPC as data. Secrets use Electron safeStorage and
 * never leave the main process: the renderer only ever sees slot metadata.
 */
import { safeStorage, ipcMain } from 'electron'

import { CapabilityRegistry, registerBuiltins } from '@mdt/capabilities'
import { z } from 'zod'

import fs from 'node:fs'
import path from 'node:path'

let registry: CapabilityRegistry | undefined

function theRegistry(): CapabilityRegistry {
  registry ??= registerBuiltins(new CapabilityRegistry())
  return registry
}

// ---------------------------------------------------------------------------
// Secrets (userData/secrets.json, values encrypted via safeStorage)
// ---------------------------------------------------------------------------

interface SecretFile {
  entries: Record<string, { encrypted: string }>;
}

const SetSecretArgs = z.object({ name: z.string().regex(/^[A-Za-z0-9_.-]+$/), value: z.string().min(1) })
const DeleteSecretArgs = z.object({ name: z.string().min(1) })

let secretsFile: string | undefined

function secretsPath(): string {
  secretsFile ??= path.join(app.getPath('userData'), 'mdt-secrets.json')
  return secretsFile
}

function readSecrets(): SecretFile {
  try {
    return JSON.parse(fs.readFileSync(secretsPath(), 'utf8')) as SecretFile
  } catch {
    return { entries: {} }
  }
}

function writeSecrets(file: SecretFile): void {
  fs.mkdirSync(path.dirname(secretsPath()), { recursive: true })
  fs.writeFileSync(secretsPath(), JSON.stringify(file, null, 2))
}

export function resolveSecret(name: string): string | undefined {
  const entry = readSecrets().entries[name]
  if (!entry) return undefined
  try {
    return safeStorage.decryptString(Buffer.from(entry.encrypted, 'base64'))
  } catch {
    return undefined
  }
}

export function registerMdtSecretIpc(): void {
  ipcMain.handle('mdt:secret-list', () => {
    // metadata only — names, never values
    return { ok: true, names: Object.keys(readSecrets().entries).sort() }
  })

  ipcMain.handle('mdt:secret-set', (_e, raw: unknown) => {
    const args = SetSecretArgs.parse(raw)
    if (!safeStorage.isEncryptionAvailable()) {
      return { ok: false, error: 'secure storage is not available on this platform' }
    }
    const file = readSecrets()
    file.entries[args.name] = { encrypted: safeStorage.encryptString(args.value).toString('base64') }
    writeSecrets(file)
    return { ok: true }
  })

  ipcMain.handle('mdt:secret-delete', (_e, raw: unknown) => {
    const args = DeleteSecretArgs.parse(raw)
    const file = readSecrets()
    delete file.entries[args.name]
    writeSecrets(file)
    return { ok: true }
  })
}

export function registerMdtCapabilityIpc(): void {
  ipcMain.handle('mdt:capability-list', () => {
    return { ok: true, manifests: theRegistry().manifests() }
  })
}
