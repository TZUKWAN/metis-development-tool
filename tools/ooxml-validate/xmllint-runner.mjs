/**
 * Cross-platform xmllint runner (V2 audit fix: CI has no system xmllint).
 *
 * Strategy: prefer the system xmllint binary (fast, matches local dev);
 * when it is not on PATH — e.g. GitHub CI runners — fall back to the
 * version-locked `xmllint-wasm` devDependency, which embeds the same
 * libxml2 and supports the exact flags used here (--noout/--nonet/
 * --schema). Both paths return the spawnSync-like shape the validators
 * consume: { status, stdout, stderr }.
 */
import { spawnSync, execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const wasmEntry = join(here, '..', '..', 'node_modules', 'xmllint-wasm', 'index.js')

let systemOk
function systemAvailable() {
  systemOk ??= spawnSync('xmllint', ['--version'], { encoding: 'utf8' }).status === 0
  return systemOk
}

function wasmAvailable() {
  try {
    execFileSync(process.execPath, ['--eval', ''], { timeout: 5_000 })
    // Probe bundle presence synchronously; the module itself loads async.
    readFileSync(wasmEntry)
    return true
  } catch {
    return false
  }
}

let wasmValidate

async function loadWasm() {
  if (wasmValidate === undefined) {
    try {
      const mod = await import(wasmEntry)
      wasmValidate = mod.validateXML ?? null
    } catch {
      wasmValidate = null
    }
  }
  return wasmValidate
}

function wasmErrorText(result) {
  if (result.rawMessages?.length) return result.rawMessages.join('\n')
  return (result.errors ?? []).map((e) => e.message ?? String(e)).join('\n')
}

/**
 * Run xmllint with the given argument list. Returns { status, stdout, stderr }
 * mirroring spawnSync(encoding:'utf8'). Async because the wasm fallback loads
 * dynamically; callers are already async.
 */
export async function runXmllint(args) {
  if (systemAvailable()) {
    const sys = spawnSync('xmllint', args, { encoding: 'utf8', maxBuffer: 256 << 20 })
    if (!sys.error && sys.status !== null) return sys
  }
  const validateXML = await loadWasm()
  if (!validateXML) {
    return {
      status: 127,
      stdout: '',
      stderr: 'xmllint not found on PATH and xmllint-wasm fallback unavailable',
    }
  }

  const schemaFiles = []
  const xmlArgs = []
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--schema') {
      i += 1
      schemaFiles.push(readFileSync(args[i], 'utf8'))
      continue
    }
    if (args[i] === '--noout' || args[i] === '--nonet' || args[i] === '--version') continue
    xmlArgs.push({ fileName: args[i], contents: readFileSync(args[i], 'utf8') })
  }

  try {
    const result = await validateXML({
      xml: xmlArgs,
      schema: schemaFiles.length > 0 ? schemaFiles : undefined,
    })
    if (result.valid) return { status: 0, stdout: '', stderr: '' }
    return { status: 1, stdout: '', stderr: wasmErrorText(result) }
  } catch (err) {
    const text = err.rawMessages?.length ? err.rawMessages.join('\n') : (err.message ?? String(err))
    return { status: 1, stdout: '', stderr: text }
  }
}

/** Synchronous availability probe (system binary or wasm bundle present). */
export function xmllintRunnerAvailable() {
  if (systemAvailable()) return true
  try {
    readFileSync(wasmEntry)
    return true
  } catch {
    return false
  }
}
