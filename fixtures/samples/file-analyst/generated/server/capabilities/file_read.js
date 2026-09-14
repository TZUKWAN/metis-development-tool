/**
 * Generated capability module — "file_read" (generator-owned).
 * Self-contained by construction (P11.21): plain JavaScript, zero npm
 * dependencies, no @mdt/* imports. The manifest below is the registry
 * manifest at generation time; `execute(input, ctx)` follows the MDT
 * capability contract (throws on failure, honors ctx.signal, never
 * returns raw secrets).
 */
export const manifest = {
  "category": "filesystem",
  "description": "Read a file from the project sandbox as utf8 text or base64.",
  "id": "file_read",
  "inputSchema": {
    "additionalProperties": false,
    "properties": {
      "encoding": {
        "description": "default utf8",
        "enum": [
          "utf8",
          "base64"
        ],
        "type": "string"
      },
      "maxBytes": {
        "description": "refuse files larger than this (default 1000000)",
        "type": "number"
      },
      "path": {
        "description": "path inside the sandbox (relative to the workdir)",
        "type": "string"
      }
    },
    "required": [
      "path"
    ],
    "type": "object"
  },
  "maxOutputBytes": 1000000,
  "name": "File Read",
  "outputSchema": {
    "additionalProperties": false,
    "properties": {
      "bytes": {
        "type": "number"
      },
      "content": {
        "type": "string"
      },
      "path": {
        "description": "resolved absolute path inside the sandbox",
        "type": "string"
      }
    },
    "required": [
      "content",
      "bytes",
      "path"
    ],
    "type": "object"
  },
  "permissions": [
    {
      "defaultGranted": false,
      "detail": "read files inside the sandbox",
      "required": true,
      "scope": "filesystem"
    }
  ],
  "secrets": [],
  "timeoutMs": 30000,
  "ui": {
    "accent": "#5b8def",
    "doc": "file-read",
    "icon": "📄",
    "keywords": [
      "file",
      "read",
      "filesystem"
    ],
    "summary": "Read a sandbox file as text or base64"
  },
  "version": "1.0.0"
}

/**
 * Self-contained `file_read` capability for generated apps (generator-owned
 * runtime source; emitted verbatim into server/capabilities/file_read.js).
 * Plain JS, zero npm dependencies. Port of @mdt/capabilities file-tools.ts
 * (file_read) plus the security/paths.ts sandbox guard it depends on:
 * every path is canonicalized (symlinks + .. resolved, with a
 * deepest-existing-ancestor fallback for missing files) and must stay inside
 * an explicit sandbox root. Requires an explicit filesystem grant — nothing
 * is default-granted.
 */
import { realpathSync } from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'

const ENCODINGS = ['utf8', 'base64']

// ---------------------------------------------------------------------------
// sandbox guard (port of security/paths.ts resolveInSandbox)
// ---------------------------------------------------------------------------

export class PathEscapeError extends Error {
  constructor(message) {
    super(message)
    this.name = 'PathEscapeError'
    this.code = 'PATH_ESCAPE'
  }
}

function canonical(p) {
  try {
    return realpathSync(p)
  } catch {
    // target does not exist yet (write case): canonicalize the deepest
    // existing ancestor and append the remainder
    const abs = path.resolve(p)
    let parent = path.dirname(abs)
    while (parent !== abs) {
      try {
        return path.join(realpathSync(parent), path.relative(parent, abs))
      } catch {
        const next = path.dirname(parent)
        if (next === parent) break
        parent = next
      }
    }
    return path.resolve(abs)
  }
}

/**
 * Resolve `userPath` inside the sandbox. `workdir` applies when the path is
 * relative. Throws PathEscapeError on escape. Returns the canonical absolute
 * path that all IO must use.
 */
export function resolveInSandbox(sandbox, userPath) {
  if (typeof userPath !== 'string' || userPath.length === 0) {
    throw new PathEscapeError('path must be a non-empty string')
  }
  if (userPath.includes('\0')) {
    throw new PathEscapeError('path contains NUL byte')
  }
  const base = path.isAbsolute(userPath)
    ? userPath
    : path.join(sandbox.workdir ?? sandbox.roots[0] ?? process.cwd(), userPath)
  const resolved = canonical(base)
  for (const root of sandbox.roots) {
    const rootCanonical = canonical(root)
    const rel = path.relative(rootCanonical, resolved)
    if (rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))) {
      return resolved
    }
  }
  throw new PathEscapeError(`path "${userPath}" escapes the sandbox roots`)
}

// ---------------------------------------------------------------------------
// shared guards
// ---------------------------------------------------------------------------

/** Permission gate: denied scopes throw a typed error (P13.06). */
export function requirePermission(ctx, capabilityId, scope) {
  if (!ctx.granted.has(scope)) {
    const error = new Error(
      `capability "${capabilityId}" requires ${scope} permission, which is not granted in this project`,
    )
    error.name = 'PermissionDeniedError'
    error.code = 'PERMISSION_DENIED'
    throw error
  }
}

function normalizeEncoding(value, label) {
  if (value === undefined || value === null || value === '') return 'utf8'
  const encoding = String(value)
  if (!ENCODINGS.includes(encoding)) {
    throw new Error(`${label}: encoding must be utf8 or base64 — got "${encoding}"`)
  }
  return encoding
}

function positiveInt(value, fallback, max, label) {
  if (value === undefined || value === null) return fallback
  const n = Number(value)
  if (!Number.isInteger(n) || n <= 0) throw new Error(`${label} must be a positive integer`)
  if (n > max) throw new Error(`${label} must be ≤ ${max}`)
  return n
}

/** Shared resolution step: throws PathEscapeError on escape. */
function sandboxResolve(ctx, userPath, label) {
  if (typeof userPath !== 'string' || userPath === '') {
    throw new PathEscapeError(`${label}: "path" is required and must be a non-empty string`)
  }
  if (!Array.isArray(ctx.sandboxRoots) || ctx.sandboxRoots.length === 0) {
    throw new PathEscapeError(
      `${label}: no sandbox roots configured in this project — cannot resolve "${userPath}"`,
    )
  }
  return resolveInSandbox({ roots: ctx.sandboxRoots, workdir: ctx.workdir }, userPath)
}

// ---------------------------------------------------------------------------
// capability
// ---------------------------------------------------------------------------

export async function execute(input, ctx) {
  requirePermission(ctx, 'file_read', 'filesystem')
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
}
