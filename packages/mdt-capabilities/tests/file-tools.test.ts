/**
 * file tools tests: sandbox resolution (../, absolute outside, symlink
 * escape), overwrite semantics, list depth/limit/truncation.
 */
import { existsSync } from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'

import { createCapabilityContext, type ContextOverrides } from '../src/context'
import { fileListCapability, fileReadCapability, fileWriteCapability } from '../src/capabilities/file-tools'
import { PathEscapeError } from '../src/security/paths'
import { runCapabilityContractTests } from '../src/testing'
import { makeTempDir, removeTempDir } from './helpers'

const root = await makeTempDir('mdt-cap-files-')
const outside = await makeTempDir('mdt-cap-outside-')
await fsp.writeFile(path.join(root, 'hello.txt'), 'hello world')
await fsp.mkdir(path.join(root, 'sub', 'deep'), { recursive: true })
await fsp.writeFile(path.join(root, 'sub', 'b.txt'), 'bee')
await fsp.writeFile(path.join(root, 'sub', 'deep', 'c.txt'), 'sea')

afterAll(async () => {
  await removeTempDir(root)
  await removeTempDir(outside)
})

const overrides: ContextOverrides = { granted: ['filesystem'], sandboxRoots: [root], workdir: root }

runCapabilityContractTests(
  fileReadCapability,
  overrides,
  { happyInput: { path: 'hello.txt' }, invalidInput: { path: '../outside.txt' } },
)
runCapabilityContractTests(
  fileWriteCapability,
  overrides,
  { happyInput: { path: 'contract-out.txt', content: 'x' }, invalidInput: { path: 'contract-out.txt' } },
)
runCapabilityContractTests(fileListCapability, overrides, { happyInput: { path: '.', depth: 1 } })

describe('file_read', () => {
  const ctx = createCapabilityContext(overrides)

  it('reads utf8 content and reports the resolved sandbox path', async () => {
    const out = await fileReadCapability.execute({ path: 'hello.txt' }, ctx)
    expect(out.content).toBe('hello world')
    expect(out.bytes).toBe(11)
    expect(out.path).toBe(path.join(root, 'hello.txt'))
  })

  it('reads base64 content', async () => {
    const out = await fileReadCapability.execute({ path: 'hello.txt', encoding: 'base64' }, ctx)
    expect(out.content).toBe(Buffer.from('hello world', 'utf8').toString('base64'))
    expect(out.bytes).toBe(11)
  })

  it('refuses directories', async () => {
    await expect(fileReadCapability.execute({ path: 'sub' }, ctx)).rejects.toThrow(/is a directory/)
  })

  it('refuses missing files', async () => {
    await expect(fileReadCapability.execute({ path: 'nope.txt' }, ctx)).rejects.toThrow()
  })

  it('enforces maxBytes', async () => {
    await fsp.writeFile(path.join(root, 'big.txt'), 'y'.repeat(5000))
    await expect(fileReadCapability.execute({ path: 'big.txt', maxBytes: 1000 }, ctx)).rejects.toThrow(
      /5000 bytes, which exceeds maxBytes \(1000\)/,
    )
  })

  it('throws PathEscapeError for ../ paths', async () => {
    await expect(fileReadCapability.execute({ path: '../outside.txt' }, ctx)).rejects.toThrow(PathEscapeError)
  })

  it('throws PathEscapeError for absolute paths outside the sandbox', async () => {
    await expect(fileReadCapability.execute({ path: path.join(outside, 'secret.txt') }, ctx)).rejects.toThrow(PathEscapeError)
  })
})

describe('file_write', () => {
  const ctx = createCapabilityContext(overrides)

  it('creates new files (created=true) and writes content', async () => {
    const out = await fileWriteCapability.execute({ path: 'out/new-a.txt', content: 'alpha' }, ctx)
    expect(out.created).toBe(true)
    expect(out.bytes).toBe(5)
    expect(out.path).toBe(path.join(root, 'out', 'new-a.txt'))
    expect(await fsp.readFile(path.join(root, 'out', 'new-a.txt'), 'utf8')).toBe('alpha')
  })

  it('refuses to overwrite unless overwrite=true', async () => {
    await expect(fileWriteCapability.execute({ path: 'out/new-a.txt', content: 'again' }, ctx)).rejects.toThrow(
      /already exists — pass overwrite: true/,
    )
    const out = await fileWriteCapability.execute({ path: 'out/new-a.txt', content: 'again', overwrite: true }, ctx)
    expect(out.created).toBe(false)
    expect(await fsp.readFile(path.join(root, 'out', 'new-a.txt'), 'utf8')).toBe('again')
  })

  it('writes base64 content', async () => {
    const expected = Buffer.from([0, 1, 2, 250, 251])
    const out = await fileWriteCapability.execute(
      { path: 'out/bin.dat', content: expected.toString('base64'), encoding: 'base64' },
      ctx,
    )
    expect(out.bytes).toBe(5)
    expect(await fsp.readFile(path.join(root, 'out', 'bin.dat'))).toEqual(expected)
  })

  it('mkdirs=false refuses when the parent is missing', async () => {
    await expect(
      fileWriteCapability.execute({ path: 'no-such-dir/x.txt', content: 'x', mkdirs: false }, ctx),
    ).rejects.toThrow(/parent directory .* does not exist and mkdirs=false/)
  })

  it('throws PathEscapeError on escape attempts', async () => {
    await expect(fileWriteCapability.execute({ path: '../evil.txt', content: 'x' }, ctx)).rejects.toThrow(PathEscapeError)
    await expect(fileWriteCapability.execute({ path: path.join(outside, 'evil.txt'), content: 'x' }, ctx)).rejects.toThrow(
      PathEscapeError,
    )
  })

  it('refuses to write a directory path', async () => {
    await expect(fileWriteCapability.execute({ path: 'sub', content: 'x', overwrite: true }, ctx)).rejects.toThrow(
      /is a directory/,
    )
  })
})

describe('file_list', () => {
  const ctx = createCapabilityContext(overrides)

  it('lists the top level by default (depth 1), sorted by name', async () => {
    // includes files created by earlier test groups (contract harness + big.txt)
    const out = await fileListCapability.execute({ path: '.' }, ctx)
    const entries = out.entries as { name: string; path: string; type: string; size: number }[]
    expect(entries.map((e) => `${e.name}:${e.type}`)).toEqual([
      'big.txt:file',
      'contract-out.txt:file',
      'hello.txt:file',
      'out:dir',
      'path:file',
      'sub:dir',
    ])
    const hello = entries.find((e) => e.name === 'hello.txt')
    expect(hello?.size).toBe(11)
    expect(hello?.path).toBe(path.join(root, 'hello.txt'))
    expect(out.truncated).toBe(false)
  })

  it('recurses with depth', async () => {
    const depth2 = await fileListCapability.execute({ path: '.', depth: 2 }, ctx)
    const names2 = (depth2.entries as { name: string }[]).map((e) => e.name)
    expect(names2).toContain('b.txt')
    expect(names2).not.toContain('c.txt')

    const depth3 = await fileListCapability.execute({ path: 'sub', depth: 3 }, ctx)
    // recursion happens inline when the 'deep' directory is reached
    const names3 = (depth3.entries as { name: string }[]).map((e) => e.name)
    expect(names3).toEqual(['b.txt', 'deep', 'c.txt'])
  })

  it('honours the limit and reports truncation', async () => {
    const out = await fileListCapability.execute({ path: '.', limit: 2 }, ctx)
    expect((out.entries as unknown[]).length).toBe(2)
    expect(out.truncated).toBe(true)
  })

  it('refuses non-directories', async () => {
    await expect(fileListCapability.execute({ path: 'hello.txt' }, ctx)).rejects.toThrow(/is not a directory/)
  })

  it('refuses symlinked entries that escape the sandbox', async () => {
    // Windows often refuses symlinks without developer mode (EPERM) — skip if it cannot be created
    const linkPath = path.join(root, 'escape-link')
    let created = true
    try {
      await fsp.symlink(outside, linkPath, 'dir')
    } catch {
      created = false // skipped: this Windows configuration cannot create symlinks
    }
    if (!created) return
    try {
      await expect(fileListCapability.execute({ path: '.', depth: 1 }, ctx)).rejects.toThrow(PathEscapeError)
      await expect(fileReadCapability.execute({ path: 'escape-link/anything.txt' }, ctx)).rejects.toThrow(PathEscapeError)
    } finally {
      await fsp.rm(linkPath, { force: true })
    }
  })

  it('requires no sandbox roots check — empty roots fail clearly', async () => {
    const noRootsCtx = createCapabilityContext({ granted: ['filesystem'], sandboxRoots: [], workdir: root })
    await expect(fileListCapability.execute({ path: '.' }, noRootsCtx)).rejects.toThrow(/no sandbox roots configured/)
  })

  it('rejects depth over the cap of 5', async () => {
    await expect(fileListCapability.execute({ path: '.', depth: 6 }, ctx)).rejects.toThrow(/depth must be ≤ 5/)
  })
})

// sanity: the contract happy path actually created its file
it('contract file exists', () => {
  expect(existsSync(path.join(root, 'contract-out.txt'))).toBe(true)
})
