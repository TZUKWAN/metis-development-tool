import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  MDT_DIR,
  PROJECT_FILE,
  atomicWriteFileSync,
  insideRoot,
  looksLikeProject,
  projectPaths,
  sha256,
} from '../src/layout'

let tmp: string
let root: string

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'mdt-layout-'))
  root = join(tmp, 'proj')
})

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true })
})

describe('projectPaths', () => {
  it('derives the documented directory layout from the root', () => {
    const paths = projectPaths(root)
    expect(paths.root).toBe(root)
    expect(paths.projectFile).toBe(join(root, PROJECT_FILE))
    expect(paths.assetsDir).toBe(join(root, 'assets'))
    expect(paths.designDir).toBe(join(root, 'design'))
    expect(paths.mdtDir).toBe(join(root, MDT_DIR))
    expect(paths.autosaveFile).toBe(join(root, MDT_DIR, 'autosave.json'))
    expect(paths.recoveryFile).toBe(join(root, MDT_DIR, 'recovery.json'))
    expect(paths.lockFile).toBe(join(root, MDT_DIR, 'lock.json'))
    expect(paths.buildsDir).toBe(join(root, MDT_DIR, 'builds'))
  })
})

describe('atomicWriteFileSync', () => {
  it('creates nested directories and round-trips string content', () => {
    const file = join(root, 'nested', 'deep', 'doc.json')
    atomicWriteFileSync(file, '{"a":1}')
    expect(readFileSync(file, 'utf8')).toBe('{"a":1}')
  })

  it('overwrites an existing target and leaves no tmp files behind', async () => {
    const file = join(root, 'doc.json')
    atomicWriteFileSync(file, 'first')
    atomicWriteFileSync(file, 'second')
    expect(readFileSync(file, 'utf8')).toBe('second')
    const { readdirSync } = await import('node:fs')
    const siblings = readdirSync(root) as string[]
    expect(siblings.every((f) => !f.includes('.tmp-'))).toBe(true)
  })

  it('accepts binary payloads (Uint8Array) byte-exactly', () => {
    const file = join(root, 'blob.bin')
    atomicWriteFileSync(file, new Uint8Array([0, 1, 2, 255]))
    const back = readFileSync(file)
    expect([...back]).toEqual([0, 1, 2, 255])
  })
})

describe('looksLikeProject', () => {
  it('is false for a missing or empty directory', () => {
    expect(looksLikeProject(root)).toBe(false) // root does not exist
    mkdirSync(root, { recursive: true })
    expect(looksLikeProject(root)).toBe(false) // no project file inside
  })

  it('is false when mdt.project.json exists but is a directory', () => {
    mkdirSync(join(root, PROJECT_FILE), { recursive: true })
    expect(looksLikeProject(root)).toBe(false)
  })

  it('is true only when the project file is a regular file', () => {
    mkdirSync(root, { recursive: true })
    writeFileSync(join(root, PROJECT_FILE), '{}')
    expect(looksLikeProject(root)).toBe(true)
  })
})

describe('insideRoot (path safety primitive)', () => {
  it('accepts the root itself and paths inside it', () => {
    expect(insideRoot(root, root)).toBe(true) // rel === ''
    expect(insideRoot(root, join(root, 'assets', 'a.png'))).toBe(true)
    expect(insideRoot(root, join(root, '.mdt', 'autosave.json'))).toBe(true)
  })

  it('rejects traversal above the root', () => {
    expect(insideRoot(root, join(root, '..', 'sibling'))).toBe(false)
    expect(insideRoot(root, join(root, 'assets', '..', '..', 'escape'))).toBe(false)
  })

  it('rejects absolute paths from outside the root (e.g. another drive on win32)', () => {
    expect(insideRoot(join(root, 'sub'), root)).toBe(false)
    // cross-drive paths make path.relative return an absolute path → rejected
    expect(insideRoot('C:\\projects\\demo', 'Q:\\elsewhere\\x')).toBe(false)
  })
})

describe('sha256', () => {
  it('hashes buffers to the expected hex digest', () => {
    expect(sha256(new Uint8Array([0x61, 0x62, 0x63]))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    )
    expect(sha256(new Uint8Array([]))).toMatch(/^[0-9a-f]{64}$/)
  })
})

describe('PROJECT_FILE / MDT_DIR constants', () => {
  it('match the documented on-disk names', () => {
    expect(PROJECT_FILE).toBe('mdt.project.json')
    expect(MDT_DIR).toBe('.mdt')
    expect(existsSync(join(tmp))).toBe(true)
  })
})
