/**
 * Emitted capability runtime tests: the newly bundled capability modules
 * (file_read / file_write / file_list / shell / python / ask_user) are
 * executed AS EMITTED — generated through the real generator pipeline
 * (generateProject), written to disk and imported like the generated app
 * would. Plus: the mcp/browser stubs must name exactly what is missing and
 * emitServer must still warn about every unbundled id.
 */
import { existsSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import fsp from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { generateProject } from '../src/generator'
import { builtinManifests, goldenBlueprint } from './helpers/blueprint'
import type { BuildBlueprint, CapabilityInstance } from '@mdt/schema'
import type { CapabilityManifest } from '@mdt/capabilities'

const manifests = builtinManifests()

/** Minimal shape of the capability context the generated server injects. */
type Ctx = {
  secrets?: Record<string, string>
  granted: Set<string>
  sandboxRoots: string[]
  workdir: string
  envAllowlist: string[]
  signal: AbortSignal
  log: (message: string) => void
  askUser?: (request: {
    kind: 'text' | 'confirm' | 'select'
    question: string
    options?: string[]
    placeholder?: string
    timeoutMs?: number
  }) => Promise<{ answered: boolean; value?: string | boolean }>
}

type Runtime = {
  execute: (input: Record<string, unknown>, ctx: Ctx) => Promise<Record<string, unknown>>
}

type PythonRuntime = Runtime & {
  resolvePythonInterpreter: () => string | null
}

function id(hex: string): string {
  return `01990000-7000-7000-8000-${hex.padStart(12, '0').slice(0, 12)}`
}

/**
 * Golden blueprint extended with instances for the six newly bundled ids AND
 * the two unbundled ones (mcp/browser) so a single generation emits every
 * module under test (and records the honest stub warnings).
 */
function runtimeBlueprint(): BuildBlueprint {
  const base = goldenBlueprint()
  const instance = (
    hex: string,
    capabilityId: string,
    permissions: CapabilityInstance['permissions'],
  ): CapabilityInstance => ({
    id: id(hex),
    capabilityId,
    version: '1.0.0',
    config: {},
    secrets: {},
    permissions,
  })
  const added: CapabilityInstance[] = [
    instance('041000000001', 'file_read', [{ scope: 'filesystem', granted: true }]),
    instance('041000000002', 'file_write', [{ scope: 'filesystem', granted: true }]),
    instance('041000000003', 'file_list', [{ scope: 'filesystem', granted: true }]),
    instance('041000000004', 'shell', [{ scope: 'process', granted: true }]),
    instance('041000000005', 'python', [{ scope: 'process', granted: true }]),
    instance('041000000006', 'ask_user', []),
    instance('041000000007', 'mcp', [{ scope: 'process', granted: true }]),
    instance('041000000008', 'browser', [{ scope: 'browser', granted: true }]),
  ]
  const addedIds = added.map((entry) => entry.id)
  const agents = base.agents.map((agent) => ({
    ...agent,
    capabilityRefs: [...agent.capabilityRefs, ...addedIds],
  }))
  return { ...base, capabilities: [...base.capabilities, ...added], agents }
}

const dirs: string[] = []
afterAll(() => {
  while (dirs.length > 0) {
    const dir = dirs.pop()
    if (dir !== undefined) rmSync(dir, { recursive: true, force: true })
  }
})

/** Generate the blueprint, write the emitted capability modules and import them. */
async function emitModules(ids: string[], warnings?: string[]): Promise<Record<string, Runtime>> {
  const outDir = mkdtempSync(join(tmpdir(), 'mdt-runtime-'))
  dirs.push(outDir)
  const result = generateProject(runtimeBlueprint(), { capabilityManifests: manifests, outDir })
  if (warnings !== undefined) warnings.push(...result.warnings)
  writeFileSync(join(outDir, 'package.json'), JSON.stringify({ type: 'module' }))
  const modules: Record<string, Runtime> = {}
  for (const capabilityId of ids) {
    const file = result.files.find(
      (candidate) => candidate.path === `server/capabilities/${capabilityId}.js`,
    )
    expect(file, `${capabilityId}.js must be emitted`).toBeDefined()
    const content = file?.content ?? ''
    // self-contained by construction (P11.21): pure ESM, zero @mdt/* imports
    expect(content).not.toMatch(/\brequire\s*\(/)
    expect(content).not.toMatch(/from\s+['"]@mdt\//)
    expect(content).not.toMatch(/import\s+['"]@mdt\//)
    writeFileSync(join(outDir, `${capabilityId}.js`), content)
    modules[capabilityId] = (await import(
      pathToFileURL(join(outDir, `${capabilityId}.js`)).href
    )) as unknown as Runtime
  }
  return modules
}

const norm = (value: unknown): string => String(value).replace(/\\/g, '/').toLowerCase()

describe('emitted file tools (file_read / file_write / file_list)', () => {
  let root: string
  let fileRead: Runtime
  let fileWrite: Runtime
  let fileList: Runtime
  let escapePath: string | null = null

  const ctx = (overrides: Partial<Ctx> = {}): Ctx => ({
    secrets: {},
    granted: new Set(['filesystem']),
    sandboxRoots: [root],
    workdir: root,
    envAllowlist: ['PATH', 'LANG', 'TZ'],
    signal: new AbortController().signal,
    log: () => {},
    ...overrides,
  })

  beforeAll(async () => {
    root = mkdtempSync(join(tmpdir(), 'mdt-runtime-files-'))
    dirs.push(root)
    const modules = await emitModules(['file_read', 'file_write', 'file_list'])
    fileRead = modules['file_read'] as Runtime
    fileWrite = modules['file_write'] as Runtime
    fileList = modules['file_list'] as Runtime

    // an outside directory a symlink could point at
    const outside = mkdtempSync(join(tmpdir(), 'mdt-runtime-outside-'))
    dirs.push(outside)
    writeFileSync(join(outside, 'secret.txt'), 'top secret')
    // file symlink needs privileges on Windows; a junction does not
    try {
      symlinkSync(join(outside, 'secret.txt'), join(root, 'evil-link.txt'), 'file')
      escapePath = 'evil-link.txt'
    } catch {
      try {
        symlinkSync(outside, join(root, 'evil-dir'), 'junction')
        escapePath = join('evil-dir', 'secret.txt')
      } catch {
        escapePath = null
      }
    }
  })

  it('denied by default (filesystem is never default-granted)', async () => {
    let caught: (Error & { code?: string }) | undefined
    try {
      await fileRead.execute({ path: 'x.txt' }, ctx({ granted: new Set() }))
    } catch (error) {
      caught = error as Error & { code?: string }
    }
    expect(caught?.name).toBe('PermissionDeniedError')
    expect(caught?.code).toBe('PERMISSION_DENIED')
    expect(caught?.message).toBe(
      'capability "file_read" requires filesystem permission, which is not granted in this project',
    )
  })

  it('refuses to resolve anything without sandbox roots', async () => {
    await expect(fileRead.execute({ path: 'x.txt' }, ctx({ sandboxRoots: [] }))).rejects.toThrow(
      /no sandbox roots configured in this project/,
    )
  })

  it('write → read round-trip (utf8 + base64) with created/bytes/path', async () => {
    const written = (await fileWrite.execute(
      { path: 'notes/hello.txt', content: 'hello mdt' },
      ctx(),
    )) as { path: string; bytes: number; created: boolean }
    expect(written.created).toBe(true)
    expect(written.bytes).toBe(9)
    expect(norm(written.path)).toBe(norm(join(root, 'notes', 'hello.txt')))
    expect(existsSync(join(root, 'notes', 'hello.txt'))).toBe(true)

    const read = (await fileRead.execute({ path: 'notes/hello.txt' }, ctx())) as {
      content: string
      bytes: number
      path: string
    }
    expect(read.content).toBe('hello mdt')
    expect(read.bytes).toBe(9)
    expect(norm(read.path)).toBe(norm(join(root, 'notes', 'hello.txt')))

    const base64 = (await fileRead.execute(
      { path: 'notes/hello.txt', encoding: 'base64' },
      ctx(),
    )) as { content: string }
    expect(base64.content).toBe(Buffer.from('hello mdt', 'utf8').toString('base64'))
  })

  it('refuses traversal outside the sandbox ("../", absolute and NUL)', async () => {
    // the outside file exists — refusal must be containment, not ENOENT
    writeFileSync(join(root, '..', 'mdt-runtime-escape-probe.txt'), 'outside')
    try {
      await expect(
        fileRead.execute({ path: '../mdt-runtime-escape-probe.txt' }, ctx()),
      ).rejects.toThrow(/escapes the sandbox roots/)
      await expect(
        fileRead.execute({ path: join(root, '..', 'mdt-runtime-escape-probe.txt') }, ctx()),
      ).rejects.toThrow(/escapes the sandbox roots/)
      await expect(
        fileWrite.execute({ path: '../escaped-write.txt', content: 'x' }, ctx()),
      ).rejects.toThrow(/escapes the sandbox roots/)
      await expect(fileRead.execute({ path: 'bad\0nul' }, ctx())).rejects.toThrow(
        'path contains NUL byte',
      )
    } finally {
      rmSync(join(root, '..', 'mdt-runtime-escape-probe.txt'), { force: true })
    }
  })

  it('refuses an existing file unless overwrite is passed', async () => {
    await expect(
      fileWrite.execute({ path: 'notes/hello.txt', content: 'second' }, ctx()),
    ).rejects.toThrow(
      'file_write: "notes/hello.txt" already exists — pass overwrite: true to replace it',
    )
    const over = (await fileWrite.execute(
      { path: 'notes/hello.txt', content: 'second', overwrite: true },
      ctx(),
    )) as { created: boolean; bytes: number }
    expect(over.created).toBe(false)
    expect(over.bytes).toBe(6)
    const reread = (await fileRead.execute({ path: 'notes/hello.txt' }, ctx())) as {
      content: string
    }
    expect(reread.content).toBe('second')
  })

  it('creates missing parents by default and honours mkdirs=false', async () => {
    const made = (await fileWrite.execute(
      { path: 'deep/nested/dir/file.txt', content: 'x' },
      ctx(),
    )) as { created: boolean }
    expect(made.created).toBe(true)
    expect(existsSync(join(root, 'deep', 'nested', 'dir', 'file.txt'))).toBe(true)
    await expect(
      fileWrite.execute({ path: 'no-parents/file.txt', content: 'x', mkdirs: false }, ctx()),
    ).rejects.toThrow(/does not exist and mkdirs=false/)
  })

  it('refuses to read a directory and enforces maxBytes', async () => {
    await fileWrite.execute({ path: 'big.txt', content: '0123456789' }, ctx())
    await expect(fileRead.execute({ path: 'notes' }, ctx())).rejects.toThrow(
      'file_read: "notes" is a directory — file_list can enumerate it',
    )
    await expect(fileRead.execute({ path: 'big.txt', maxBytes: 5 }, ctx())).rejects.toThrow(
      'file_read: file is 10 bytes, which exceeds maxBytes (5)',
    )
  })

  it('honours depth and limit caps with a truncated flag', async () => {
    await fileWrite.execute({ path: 'tree/a/one.txt', content: '1' }, ctx())
    await fileWrite.execute({ path: 'tree/a/sub/deep.txt', content: '2' }, ctx())
    await fileWrite.execute({ path: 'tree/b.txt', content: '3' }, ctx())

    const flat = (await fileList.execute({ path: 'tree' }, ctx())) as {
      entries: { name: string; type: string; size: number }[]
      truncated: boolean
    }
    expect(flat.truncated).toBe(false)
    expect(flat.entries.map((entry) => entry.name)).toEqual(['a', 'b.txt'])
    expect(flat.entries[0]).toMatchObject({ name: 'a', type: 'dir', size: 0 })
    expect(flat.entries[1]).toMatchObject({ name: 'b.txt', type: 'file', size: 1 })

    const deep = (await fileList.execute({ path: 'tree', depth: 5 }, ctx())) as {
      entries: { path: string; type: string }[]
      truncated: boolean
    }
    expect(deep.truncated).toBe(false)
    expect(deep.entries.map((entry) => norm(entry.path))).toEqual(
      [
        join(root, 'tree', 'a'),
        join(root, 'tree', 'a', 'one.txt'),
        join(root, 'tree', 'a', 'sub'),
        join(root, 'tree', 'a', 'sub', 'deep.txt'),
        join(root, 'tree', 'b.txt'),
      ].map(norm),
    )

    const depth2 = (await fileList.execute({ path: 'tree', depth: 2 }, ctx())) as {
      entries: { name: string }[]
    }
    expect(depth2.entries.map((entry) => entry.name)).toEqual(['a', 'one.txt', 'sub', 'b.txt'])

    const capped = (await fileList.execute({ path: 'tree', depth: 5, limit: 3 }, ctx())) as {
      entries: { name: string }[]
      truncated: boolean
    }
    expect(capped.truncated).toBe(true)
    expect(capped.entries.map((entry) => entry.name)).toEqual(['a', 'one.txt', 'sub'])

    await expect(fileList.execute({ path: 'tree', depth: 6 }, ctx())).rejects.toThrow(
      'file_list: depth must be ≤ 5',
    )
    await expect(fileList.execute({ path: 'tree', limit: 1001 }, ctx())).rejects.toThrow(
      'file_list: limit must be ≤ 1000',
    )
  })

  it('refuses a symlink that escapes the sandbox', async () => {
    if (escapePath === null) {
      // Windows without symlink/junction privilege — the guard is still
      // covered by the canonicalize+containment tests above
      console.warn('skipping symlink-escape assertions: symlink/junction creation unavailable')
      return
    }
    await expect(fileRead.execute({ path: escapePath }, ctx())).rejects.toThrow(
      /escapes the sandbox roots/,
    )
    // file_list re-resolves EVERY entry — one escaping symlink refuses the listing
    await expect(fileList.execute({ path: '.' }, ctx())).rejects.toThrow(
      /escapes the sandbox roots/,
    )
  })
})

describe('emitted shell', () => {
  let shell: Runtime
  let root: string

  const ctx = (overrides: Partial<Ctx> = {}): Ctx => ({
    secrets: {},
    granted: new Set(['process']),
    sandboxRoots: [root],
    workdir: root,
    envAllowlist: ['PATH', 'LANG', 'TZ'],
    signal: new AbortController().signal,
    log: () => {},
    ...overrides,
  })

  beforeAll(async () => {
    root = mkdtempSync(join(tmpdir(), 'mdt-runtime-shell-'))
    dirs.push(root)
    const modules = await emitModules(['shell'])
    shell = modules['shell'] as Runtime
  })

  it('denied by default (process is never default-granted)', async () => {
    await expect(shell.execute({ command: 'node' }, ctx({ granted: new Set() }))).rejects.toThrow(
      'capability "shell" requires process permission, which is not granted in this project',
    )
  })

  it('refuses to run without an explicit sandbox root', async () => {
    await expect(shell.execute({ command: 'node' }, ctx({ sandboxRoots: [] }))).rejects.toThrow(
      'shell capability requires an explicit sandbox root',
    )
  })

  it('runs node with args, no shell (stdout 42)', async () => {
    const out = (await shell.execute(
      { command: 'node', args: ['-e', 'console.log(42)'] },
      ctx(),
    )) as { exitCode: number; stdout: string; stderr: string; truncated: boolean; signal: string }
    expect(out.exitCode).toBe(0)
    expect(out.stdout.trim()).toBe('42')
    expect(out.stderr).toBe('')
    expect(out.truncated).toBe(false)
    expect(out.signal).toBe('')
  })

  it('only exposes allowlisted env vars to the child', async () => {
    process.env.MDT_RUNTIME_MARKER = 'marker-secret-value'
    try {
      const out = (await shell.execute(
        { command: 'node', args: ['-e', 'console.log(Object.keys(process.env).join(","))'] },
        ctx({ envAllowlist: ['PATH'] }),
      )) as { exitCode: number; stdout: string }
      expect(out.exitCode).toBe(0)
      expect(out.stdout).not.toContain('MDT_RUNTIME_MARKER')
      expect(out.stdout).not.toContain('marker-secret-value')
      expect(out.stdout).toContain('PATH')
    } finally {
      delete process.env.MDT_RUNTIME_MARKER
    }
  })

  it('kills the child on timeout and reports a structured error', async () => {
    await expect(
      shell.execute(
        { command: 'node', args: ['-e', 'setTimeout(() => {}, 30000)'], timeoutMs: 300 },
        ctx(),
      ),
    ).rejects.toThrow('shell: command timed out after 300ms and was killed')
  })

  it('resolves cwd inside the sandbox and refuses escapes', async () => {
    await fsp.mkdir(join(root, 'cwd-target'), { recursive: true })
    const out = (await shell.execute(
      { command: 'node', args: ['-e', 'process.stdout.write(process.cwd())'], cwd: 'cwd-target' },
      ctx(),
    )) as { stdout: string }
    expect(norm(out.stdout)).toBe(norm(join(root, 'cwd-target')))
    await expect(shell.execute({ command: 'node', cwd: '..' }, ctx())).rejects.toThrow(
      /escapes the sandbox roots/,
    )
  })

  it('maps spawn failures onto structured errors (no hang)', async () => {
    await expect(
      shell.execute({ command: 'definitely-not-a-real-cmd-xyz' }, ctx()),
    ).rejects.toThrow(/failed to start "definitely-not-a-real-cmd-xyz"/)
  })
})

describe('emitted python', () => {
  let python: PythonRuntime
  let root: string

  const ctx = (overrides: Partial<Ctx> = {}): Ctx => ({
    secrets: {},
    granted: new Set(['process']),
    sandboxRoots: [root],
    workdir: root,
    envAllowlist: ['PATH', 'LANG', 'TZ'],
    signal: new AbortController().signal,
    log: () => {},
    ...overrides,
  })

  beforeAll(async () => {
    root = mkdtempSync(join(tmpdir(), 'mdt-runtime-python-'))
    dirs.push(root)
    const modules = await emitModules(['python'])
    python = modules['python'] as unknown as PythonRuntime
  })

  it('denied by default (process is never default-granted)', async () => {
    await expect(
      python.execute({ script: 'print(1)' }, ctx({ granted: new Set() })),
    ).rejects.toThrow(
      'capability "python" requires process permission, which is not granted in this project',
    )
  })

  it('refuses to run without an explicit sandbox root', async () => {
    await expect(python.execute({ script: 'print(1)' }, ctx({ sandboxRoots: [] }))).rejects.toThrow(
      'python capability requires an explicit sandbox root',
    )
  })

  it('runs print(6*7) via stdin in isolated mode — or reports unavailable', async () => {
    if (python.resolvePythonInterpreter() === null) {
      await expect(python.execute({ script: 'print(1)' }, ctx())).rejects.toThrow(
        'python capability unavailable: no python interpreter found on this machine',
      )
      console.warn('no python interpreter on this machine — happy path skipped')
      return
    }
    const out = (await python.execute({ script: 'print(6*7)' }, ctx())) as {
      exitCode: number
      stdout: string
      stderr: string
      truncated: boolean
    }
    expect(out.exitCode).toBe(0)
    expect(out.stdout.trim()).toBe('42')
    expect(out.truncated).toBe(false)
  })

  it('passes args after "-" as sys.argv', async () => {
    if (python.resolvePythonInterpreter() === null) return
    const out = (await python.execute(
      { script: 'import sys\nprint("args", sys.argv[1:])', args: ['one', 'two'] },
      ctx(),
    )) as { exitCode: number; stdout: string }
    expect(out.exitCode).toBe(0)
    expect(out.stdout.trim()).toBe("args ['one', 'two']")
  })

  it('kills long scripts on timeout', async () => {
    if (python.resolvePythonInterpreter() === null) return
    await expect(
      python.execute({ script: 'import time\ntime.sleep(30)', timeoutMs: 300 }, ctx()),
    ).rejects.toThrow('python: script timed out after 300ms and was killed')
  })
})

describe('emitted ask_user', () => {
  let askUser: Runtime
  let root: string

  const ctx = (overrides: Partial<Ctx> = {}): Ctx => ({
    secrets: {},
    granted: new Set(),
    sandboxRoots: [root],
    workdir: root,
    envAllowlist: ['PATH', 'LANG', 'TZ'],
    signal: new AbortController().signal,
    log: () => {},
    ...overrides,
  })

  beforeAll(async () => {
    root = mkdtempSync(join(tmpdir(), 'mdt-runtime-ask-'))
    dirs.push(root)
    const modules = await emitModules(['ask_user'])
    askUser = modules['ask_user'] as Runtime
  })

  it('throws a clear error when no ask bridge is wired', async () => {
    await expect(askUser.execute({ kind: 'text', question: 'Pick one' }, ctx())).rejects.toThrow(
      'ask_user requires an ask bridge — wire one in server/index.js',
    )
  })

  it('resolves through the injected ctx.askUser bridge', async () => {
    const requests: unknown[] = []
    const out = (await askUser.execute(
      { kind: 'select', question: 'Pick a color', options: ['red', 'blue'] },
      ctx({
        askUser: async (request) => {
          requests.push(request)
          return { answered: true, value: 'blue' }
        },
      }),
    )) as { answered: boolean; value: string }
    expect(out).toEqual({ answered: true, value: 'blue' })
    expect(requests[0]).toMatchObject({
      kind: 'select',
      question: 'Pick a color',
      options: ['red', 'blue'],
    })
  })

  it('falls back to the globalThis.__mdtAskUser extension point', async () => {
    ;(globalThis as { __mdtAskUser?: unknown }).__mdtAskUser = async (request: {
      question: string
    }) => ({ answered: true, value: request.question })
    try {
      const out = (await askUser.execute(
        { kind: 'text', question: 'hello?' },
        ctx({ askUser: undefined }),
      )) as { answered: boolean; value: string }
      expect(out).toEqual({ answered: true, value: 'hello?' })
    } finally {
      delete (globalThis as { __mdtAskUser?: unknown }).__mdtAskUser
    }
  })

  it('validates questions and rejects a pre-aborted signal', async () => {
    await expect(askUser.execute({ kind: 'text', question: '' }, ctx())).rejects.toThrow(
      'question must not be empty',
    )
    await expect(
      askUser.execute({ kind: 'select', question: 'Pick', options: [] }, ctx()),
    ).rejects.toThrow('select questions need a non-empty options array')
    const controller = new AbortController()
    controller.abort()
    await expect(
      askUser.execute(
        { kind: 'text', question: 'Pick' },
        ctx({
          signal: controller.signal,
          // a pending bridge (a real UI wait) loses the race to the abort
          askUser: () => new Promise(() => {}),
        }),
      ),
    ).rejects.toThrow('ask_user cancelled')
  })
})

describe('unbundled capability stubs (mcp / browser)', () => {
  it('emits focused stubs naming exactly what is missing, with honest warnings', async () => {
    const warnings: string[] = []
    const modules = await emitModules(['mcp', 'browser'], warnings)
    await expect(modules['mcp']?.execute({}, {} as Ctx)).rejects.toThrow(
      'MCP transport is not bundled in this generated app — add server/mcp-transport.js',
    )
    await expect(modules['browser']?.execute({}, {} as Ctx)).rejects.toThrow(
      'browser capability requires a Playwright driver — register one in server/index.js',
    )
    const joined = warnings.join('\n')
    expect(joined).toContain('capability "mcp" has no bundled runtime in this generator build')
    expect(joined).toContain('capability "browser" has no bundled runtime in this generator build')
    // the bundled ids must NOT be reported as unbundled
    expect(joined).not.toContain('capability "file_read" has no bundled runtime')
    expect(joined).not.toContain('capability "shell" has no bundled runtime')
  })
})
