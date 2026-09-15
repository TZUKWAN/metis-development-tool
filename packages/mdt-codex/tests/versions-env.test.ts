import {
  existsSync,
  linkSync,
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { checkAvailability, resolveCodexBinary } from '../src/versions'

let tmp: string
const prevAppData: string | undefined = process.env.APPDATA
const prevPath: string | undefined = process.env.PATH

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'mdt-codex-env-'))
})

afterEach(() => {
  // restore the process environment no matter what a test did to it
  if (prevAppData === undefined) delete process.env.APPDATA
  else process.env.APPDATA = prevAppData
  if (prevPath === undefined) delete process.env.PATH
  else process.env.PATH = prevPath
  rmSync(tmp, { recursive: true, force: true })
})

const WIN = process.platform === 'win32'

describe('resolveCodexBinary environment branches (P10.03)', () => {
  it('uses an explicit path unchanged (both with and without one)', () => {
    expect(resolveCodexBinary('C:\\tools\\codex.exe')).toEqual({
      command: 'C:\\tools\\codex.exe',
      argsPrefix: [],
    })
    const resolved = resolveCodexBinary(undefined)
    expect(typeof resolved.command).toBe('string')
    expect(resolved.command.length).toBeGreaterThan(0)
    expect(Array.isArray(resolved.argsPrefix)).toBe(true)
  })

  it.runIf(WIN)('prefers the APPDATA vendor binary when it exists', () => {
    const vendorBin = join(
      tmp,
      'npm',
      'node_modules',
      '@openai',
      'codex',
      'node_modules',
      '@openai',
      'codex-win32-x64',
      'vendor',
      'x86_64-pc-windows-msvc',
      'bin',
    )
    mkdirSync(vendorBin, { recursive: true })
    writeFileSync(join(vendorBin, 'codex.exe'), 'existence is all the resolver checks')
    process.env.APPDATA = tmp
    const resolved = resolveCodexBinary()
    expect(resolved.command).toBe(join(vendorBin, 'codex.exe'))
    expect(resolved.argsPrefix).toEqual([])
  })

  it.runIf(WIN)('falls back to plain "codex" when the APPDATA candidate is absent', () => {
    delete process.env.APPDATA
    const resolved = resolveCodexBinary()
    expect(resolved.command).toBe('codex')
    expect(resolved.argsPrefix).toEqual([])
  })
})

describe('checkAvailability environment branches (P10.03, P10.19)', () => {
  it.runIf(WIN)('reports not-installed with guidance when no codex is resolvable', () => {
    // an empty PATH + no APPDATA: nothing named codex exists
    const emptyDir = join(tmp, 'empty-bin')
    mkdirSync(emptyDir, { recursive: true })
    process.env.PATH = emptyDir
    delete process.env.APPDATA
    const availability = checkAvailability()
    expect(availability.installed).toBe(false)
    expect(availability.version).toBeUndefined()
    expect(availability.compatWarning).toContain('npm install -g @openai/codex')
  })

  it.runIf(WIN)(
    'a codex outside the verified range that is not logged in gets BOTH warnings',
    () => {
      // node.exe posing as codex: `codex --version` → v-prefixed semver,
      // `codex login status` → non-zero exit. Instant, deterministic, offline.
      const binDir = join(tmp, 'fake-bin')
      mkdirSync(binDir, { recursive: true })
      const fakeCodex = join(binDir, 'codex.exe')
      try {
        linkSync(process.execPath, fakeCodex)
      } catch {
        copyFileSync(process.execPath, fakeCodex) // cross-volume fallback
      }
      expect(existsSync(fakeCodex)).toBe(true)
      process.env.PATH = `${binDir}${delimiter}${prevPath ?? ''}`
      delete process.env.APPDATA

      const availability = checkAvailability()
      expect(availability.installed).toBe(true)
      expect(availability.version).toMatch(/^\d+\.\d+\.\d+$/)
      // node's own major (e.g. 22) lies far outside the 0.140–0.200 window
      expect(availability.compatWarning).toContain('outside the MDT-verified range')
      expect(availability.loggedIn).toBe(false)
      expect(availability.compatWarning).toContain('not logged in')
    },
  )
})
