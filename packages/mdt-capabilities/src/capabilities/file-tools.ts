/**
 * Filesystem capabilities (tasklist P09.12–P09.14): file_read / file_write /
 * file_list. Every path is resolved through `resolveInSandbox` (canonicalize
 * + containment check, symlink-aware), and every capability requires an
 * explicit filesystem grant — nothing is default-granted.
 */
import { existsSync } from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'

import { requirePermission } from '../context'
import type { Capability, CapabilityContext } from '../manifest'
import { PathEscapeError, resolveInSandbox } from '../security/paths'

const ENCODINGS = ['utf8', 'base64'] as const
type Encoding = (typeof ENCODINGS)[number]

function normalizeEncoding(value: unknown, label: string): Encoding {
  if (value === undefined || value === null || value === '') return 'utf8'
  const encoding = String(value)
  if (!(ENCODINGS as readonly string[]).includes(encoding)) {
    throw new Error(`${label}: encoding must be utf8 or base64 — got "${encoding}"`)
  }
  return encoding as Encoding
}

function positiveInt(value: unknown, fallback: number, max: number, label: string): number {
  if (value === undefined || value === null) return fallback
  const n = Number(value)
  if (!Number.isInteger(n) || n <= 0) throw new Error(`${label} must be a positive integer`)
  if (n > max) throw new Error(`${label} must be ≤ ${max}`)
  return n
}

/** Shared resolution step: throws PathEscapeError on escape. */
function sandboxResolve(ctx: CapabilityContext, userPath: unknown, label: string): string {
  if (typeof userPath !== 'string' || userPath === '') {
    throw new PathEscapeError(`${label}: "path" is required and must be a non-empty string`)
  }
  if (ctx.sandboxRoots.length === 0) {
    throw new PathEscapeError(
      `${label}: no sandbox roots configured in this project — cannot resolve "${userPath}"`,
    )
  }
  return resolveInSandbox({ roots: ctx.sandboxRoots, workdir: ctx.workdir }, userPath)
}

// ---------------------------------------------------------------------------
// file_read
// ---------------------------------------------------------------------------

export const fileReadCapability: Capability = {
  manifest: {
    id: 'file_read',
    name: 'File Read',
    version: '1.0.0',
    category: 'filesystem',
    description: 'Read a file from the project sandbox as utf8 text or base64.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'path inside the sandbox (relative to the workdir)' },
        encoding: { type: 'string', enum: ['utf8', 'base64'], description: 'default utf8' },
        maxBytes: {
          type: 'number',
          description: 'refuse files larger than this (default 1000000)',
        },
      },
      required: ['path'],
      additionalProperties: false,
    },
    outputSchema: {
      type: 'object',
      properties: {
        content: { type: 'string' },
        bytes: { type: 'number' },
        path: { type: 'string', description: 'resolved absolute path inside the sandbox' },
      },
      required: ['content', 'bytes', 'path'],
      additionalProperties: false,
    },
    permissions: [
      {
        scope: 'filesystem',
        detail: 'read files inside the sandbox',
        required: true,
        defaultGranted: false,
      },
    ],
    secrets: [],
    ui: {
      icon: '📄',
      accent: '#5b8def',
      summary: 'Read a sandbox file as text or base64',
      keywords: ['file', 'read', 'filesystem'],
      doc: 'file-read',
    },
    timeoutMs: 30_000,
    maxOutputBytes: 1_000_000,
  },
  async execute(
    input: Record<string, unknown>,
    ctx: CapabilityContext,
  ): Promise<Record<string, unknown>> {
    requirePermission(ctx, fileReadCapability, 'filesystem')
    const resolved = sandboxResolve(ctx, input.path, 'file_read')
    const encoding = normalizeEncoding(input.encoding, 'file_read')
    const maxBytes = positiveInt(input.maxBytes, 1_000_000, 100_000_000, 'file_read: maxBytes')

    const stat = await fsp.stat(resolved)
    if (stat.isDirectory())
      throw new Error(`file_read: "${input.path}" is a directory — file_list can enumerate it`)
    if (stat.size > maxBytes) {
      throw new Error(`file_read: file is ${stat.size} bytes, which exceeds maxBytes (${maxBytes})`)
    }
    const buffer = await fsp.readFile(resolved)
    ctx.log(`file_read ${resolved} (${buffer.byteLength}B, ${encoding})`)
    return {
      content: encoding === 'base64' ? buffer.toString('base64') : buffer.toString('utf8'),
      bytes: buffer.byteLength,
      path: resolved,
    }
  },
}

// ---------------------------------------------------------------------------
// file_write
// ---------------------------------------------------------------------------

export const fileWriteCapability: Capability = {
  manifest: {
    id: 'file_write',
    name: 'File Write',
    version: '1.0.0',
    category: 'filesystem',
    description: 'Create or (explicitly) overwrite a file inside the project sandbox.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'path inside the sandbox (relative to the workdir)' },
        content: { type: 'string', description: 'file content (utf8 text or base64)' },
        encoding: { type: 'string', enum: ['utf8', 'base64'], description: 'default utf8' },
        overwrite: {
          type: 'boolean',
          description: 'allow replacing an existing file (default false)',
        },
        mkdirs: {
          type: 'boolean',
          description: 'create missing parent directories (default true)',
        },
      },
      required: ['path', 'content'],
      additionalProperties: false,
    },
    outputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'resolved absolute path inside the sandbox' },
        bytes: { type: 'number' },
        created: { type: 'boolean', description: 'true when the file did not exist before' },
      },
      required: ['path', 'bytes', 'created'],
      additionalProperties: false,
    },
    permissions: [
      {
        scope: 'filesystem',
        detail: 'write files inside the sandbox',
        required: true,
        defaultGranted: false,
      },
    ],
    secrets: [],
    ui: {
      icon: '✏️',
      accent: '#5b8def',
      summary: 'Write or overwrite a sandbox file',
      keywords: ['file', 'write', 'filesystem'],
      doc: 'file-write',
    },
    timeoutMs: 30_000,
    maxOutputBytes: 1_000_000,
  },
  async execute(
    input: Record<string, unknown>,
    ctx: CapabilityContext,
  ): Promise<Record<string, unknown>> {
    requirePermission(ctx, fileWriteCapability, 'filesystem')
    const resolved = sandboxResolve(ctx, input.path, 'file_write')
    if (input.content === undefined || input.content === null)
      throw new Error('file_write: "content" is required')
    const encoding = normalizeEncoding(input.encoding, 'file_write')
    const overwrite = input.overwrite === true
    const mkdirs = input.mkdirs !== false

    const existed = existsSync(resolved)
    if (existed && !overwrite) {
      throw new Error(
        `file_write: "${input.path}" already exists — pass overwrite: true to replace it`,
      )
    }
    if (existed) {
      const stat = await fsp.stat(resolved)
      if (stat.isDirectory())
        throw new Error(
          `file_write: "${input.path}" is a directory and cannot be written as a file`,
        )
    }
    const buffer =
      encoding === 'base64'
        ? Buffer.from(String(input.content), 'base64')
        : Buffer.from(String(input.content), 'utf8')
    const parent = path.dirname(resolved)
    if (!existsSync(parent)) {
      if (!mkdirs)
        throw new Error(`file_write: parent directory "${parent}" does not exist and mkdirs=false`)
      await fsp.mkdir(parent, { recursive: true })
    }
    await fsp.writeFile(resolved, buffer)
    ctx.log(
      `file_write ${resolved} (${buffer.byteLength}B, ${existed ? 'overwritten' : 'created'})`,
    )
    return { path: resolved, bytes: buffer.byteLength, created: !existed }
  },
}

// ---------------------------------------------------------------------------
// file_list
// ---------------------------------------------------------------------------

export const fileListCapability: Capability = {
  manifest: {
    id: 'file_list',
    name: 'File List',
    version: '1.0.0',
    category: 'filesystem',
    description: 'List files and directories under a sandbox path, with depth and entry limits.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'sandbox directory to list (default ".")' },
        depth: { type: 'number', description: 'recursion depth, 1–5 (default 1)' },
        limit: { type: 'number', description: 'max entries, ≤ 1000 (default 200)' },
      },
      required: [],
      additionalProperties: false,
    },
    outputSchema: {
      type: 'object',
      properties: {
        entries: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              path: { type: 'string' },
              type: { type: 'string', enum: ['file', 'dir'] },
              size: { type: 'number' },
            },
            required: ['name', 'path', 'type', 'size'],
          },
        },
        truncated: { type: 'boolean' },
      },
      required: ['entries', 'truncated'],
      additionalProperties: false,
    },
    permissions: [
      {
        scope: 'filesystem',
        detail: 'list files inside the sandbox',
        required: true,
        defaultGranted: false,
      },
    ],
    secrets: [],
    ui: {
      icon: '🗂️',
      accent: '#5b8def',
      summary: 'List sandbox files and directories',
      keywords: ['file', 'list', 'directory', 'tree'],
      doc: 'file-list',
    },
    timeoutMs: 30_000,
    maxOutputBytes: 1_000_000,
  },
  async execute(
    input: Record<string, unknown>,
    ctx: CapabilityContext,
  ): Promise<Record<string, unknown>> {
    requirePermission(ctx, fileListCapability, 'filesystem')
    const userPath =
      input.path === undefined || input.path === null || input.path === '' ? '.' : input.path
    const resolved = sandboxResolve(ctx, userPath, 'file_list')
    const depth = positiveInt(input.depth, 1, 5, 'file_list: depth')
    const limit = positiveInt(input.limit, 200, 1000, 'file_list: limit')

    const rootStat = await fsp.stat(resolved)
    if (!rootStat.isDirectory()) throw new Error(`file_list: "${userPath}" is not a directory`)

    const entries: { name: string; path: string; type: 'file' | 'dir'; size: number }[] = []
    let truncated = false
    const walk = async (dir: string, level: number): Promise<void> => {
      if (entries.length >= limit) {
        truncated = true
        return
      }
      const dirents = await fsp.readdir(dir, { withFileTypes: true })
      dirents.sort((a, b) => a.name.localeCompare(b.name))
      for (const dirent of dirents) {
        if (entries.length >= limit) {
          truncated = true
          return
        }
        // resolve EVERY entry through the sandbox guard — symlinked dirs that
        // escape throw here and the whole listing is refused
        const joined = path.join(dir, dirent.name)
        const real = resolveInSandbox({ roots: ctx.sandboxRoots, workdir: ctx.workdir }, joined)
        const stat = await fsp.stat(real)
        const isDir = stat.isDirectory()
        entries.push({
          name: dirent.name,
          path: real,
          type: isDir ? 'dir' : 'file',
          size: isDir ? 0 : stat.size,
        })
        if (isDir && level + 1 < depth) await walk(real, level + 1)
      }
    }
    await walk(resolved, 0)
    ctx.log(
      `file_list ${resolved} depth=${depth} entries=${entries.length}${truncated ? ' (truncated)' : ''}`,
    )
    return { entries, truncated }
  },
}
