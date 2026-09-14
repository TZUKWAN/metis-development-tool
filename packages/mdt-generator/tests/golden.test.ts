import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

import { afterEach, describe, expect, test } from 'vitest'

import { generateProject, writeProject } from '../src/generator'
import { builtinManifests, goldenBlueprint } from './helpers/blueprint'
import type { CapabilityManifest } from '@mdt/capabilities'

const manifests = builtinManifests()

function generateTwice(): {
  filesA: ReturnType<typeof generateProject>
  filesB: ReturnType<typeof generateProject>
} {
  // generateProject is pure — outDir is only recorded for the write step
  const options = (): { capabilityManifests: Map<string, CapabilityManifest>; outDir: string } => ({
    capabilityManifests: manifests,
    outDir: join(tmpdir(), 'mdt-golden-unused'),
  })
  const outA = options()
  const outB = options()
  const filesA = generateProject(goldenBlueprint(), {
    capabilityManifests: outA.capabilityManifests,
    outDir: outA.outDir,
  })
  const filesB = generateProject(goldenBlueprint(), {
    capabilityManifests: outB.capabilityManifests,
    outDir: outB.outDir,
  })
  return { filesA, filesB }
}

const dirs: string[] = []
afterEach(() => {
  while (dirs.length > 0) {
    const dir = dirs.pop()
    if (dir !== undefined) rmSync(dir, { recursive: true, force: true })
  }
})

function trackDir<T extends string>(path: T): T {
  dirs.push(path)
  return path
}

describe('golden generation', () => {
  test('two generations produce byte-identical file trees and a stable hash', () => {
    const { filesA, filesB } = generateTwice()
    const treeA = filesA.files.map((file) => [file.path, file.content])
    const treeB = filesB.files.map((file) => [file.path, file.content])
    expect(treeB).toEqual(treeA)
    const digest = (files: ReturnType<typeof generateProject>): string =>
      createHash('sha256')
        .update(files.files.map((file) => `${file.path}\n${file.content}`).join('\n---\n'))
        .digest('hex')
    expect(digest(filesB)).toBe(digest(filesA))
    // the digest is reproducible across processes only if file order is stable
    const paths = filesA.files.map((file) => file.path)
    expect([...paths].sort((a, b) => a.localeCompare(b))).toEqual(paths)
  })

  test('emits the expected file tree', () => {
    const { filesA } = generateTwice()
    const paths = filesA.files.map((file) => file.path)
    const expected = [
      '.env.example',
      '.mdt/generator-manifest.json',
      'README.md',
      'server/agents.config.json',
      'server/capabilities/index.js',
      'server/capabilities/datetime.js',
      'server/capabilities/web_fetch.js',
      'server/capabilities/web_search.js',
      'src/pages/DetailsPage.tsx',
      'src/pages/HomePage.tsx',
      'src/pages/NewResearchOverlay.tsx',
      'src/pages/ResearchPage.tsx',
      'src/routes.ts',
      'tests/e2e/chat.spec.ts',
      'tests/e2e/navigation.spec.ts',
      'tests/e2e/smoke.spec.ts',
    ]
    for (const path of expected) {
      expect(paths, `missing ${path}`).toContain(path)
    }
    expect(paths).not.toContain('tests/e2e/unknown.spec.ts')
  })

  test('route table maps three pages with the first as index', () => {
    const { filesA } = generateTwice()
    const routes = filesA.files.find((file) => file.path === 'src/routes.ts')
    expect(routes?.content).toContain("import HomePage from './pages/HomePage'")
    expect(routes?.content).toContain("path: '/'")
    expect(routes?.content).toContain("path: '/research'")
    expect(routes?.content).toContain("path: '/details'")
  })

  test('chat page wires the agent hook, SSE client and chat element', () => {
    const { filesA } = generateTwice()
    const home = filesA.files.find((file) => file.path === 'src/pages/HomePage.tsx')
    expect(home?.content).toContain("useAgentRun('01990000-7000-7000-8000-030000000001')")
    expect(home?.content).toContain("mdtId='01990000-7000-7000-8000-020000000005'")
    expect(home?.content).toContain('send(toDisplayText(resolveSource(')
    // interactions compiled into handlers + overlay wiring
    expect(home?.content).toContain('setOpenOverlays')
    expect(home?.content).toContain("import NewResearchOverlay from './NewResearchOverlay'")
    expect(home?.content).toContain("storeForScope('session')")
  })

  test('agents.config.json is the server source of truth with model policy + tool refs', () => {
    const { filesA } = generateTwice()
    const config = filesA.files.find((file) => file.path === 'server/agents.config.json')
    const parsed = JSON.parse(config?.content ?? '{}') as {
      agents: {
        id: string
        modelPolicy: { provider: string; model: string; api: string; compat?: unknown }
        capabilityInstanceIds: string[]
      }[]
      tools: { id: string }[]
    }
    expect(parsed.agents).toHaveLength(1)
    expect(parsed.agents[0]?.modelPolicy).toMatchObject({
      provider: 'openai',
      model: 'gpt-5.1',
      api: 'openai-completions',
      compat: { supportsDeveloperRole: false },
    })
    expect(parsed.agents[0]?.capabilityInstanceIds).toEqual([
      '01990000-7000-7000-8000-040000000001',
      '01990000-7000-7000-8000-040000000002',
      '01990000-7000-7000-8000-040000000003',
    ])
    expect(parsed.tools.map((tool) => tool.id).sort()).toEqual([
      'datetime',
      'web_fetch',
      'web_search',
    ])
  })

  test('snapshot: routes.ts', () => {
    const { filesA } = generateTwice()
    const routes = filesA.files.find((file) => file.path === 'src/routes.ts')
    expect(routes?.content).toMatchSnapshot('routes.ts')
  })

  test('snapshot: HomePage.tsx (chat page)', () => {
    const { filesA } = generateTwice()
    const home = filesA.files.find((file) => file.path === 'src/pages/HomePage.tsx')
    expect(home?.content).toMatchSnapshot('HomePage.tsx')
  })

  test('snapshot: server/pi-runtime.js (template base)', () => {
    const { filesA } = generateTwice()
    const runtime = filesA.files.find((file) => file.path === 'server/pi-runtime.js')
    expect(runtime?.content).toContain('streamSimple')
    expect(runtime?.content).toContain('@earendil-works/pi-agent-core')
    expect(runtime?.content).toMatchSnapshot('pi-runtime.js')
  })

  test('snapshot: server/agents.config.json', () => {
    const { filesA } = generateTwice()
    const config = filesA.files.find((file) => file.path === 'server/agents.config.json')
    expect(config?.content).toMatchSnapshot('agents.config.json')
  })

  test('generated app has no @mdt/* or @openai/codex dependencies (P11.21, P10.18)', () => {
    const { filesA } = generateTwice()
    const pkg = JSON.parse(
      filesA.files.find((file) => file.path === 'package.json')?.content ?? '{}',
    ) as { dependencies: Record<string, string>; devDependencies: Record<string, string> }
    const all = Object.keys(pkg.dependencies ?? {})
    for (const name of all) {
      expect(name.startsWith('@mdt/'), `forbidden dependency ${name}`).toBe(false)
      expect(name, '@openai/codex must not appear').not.toBe('@openai/codex')
    }
    expect(Object.keys(pkg.devDependencies ?? {})).not.toContain('@openai/codex')
  })

  test('.mdt-map.json entries carry file + line hints for ids (validated via written output)', async () => {
    const { filesA } = generateTwice()
    void filesA
    // write to disk and read the map artifact (also validates writeProject)
    const outDir = trackDir(mkdtempSync(join(tmpdir(), 'mdt-map-')))
    const result = generateProject(goldenBlueprint(), {
      capabilityManifests: manifests,
      outDir,
    })
    writeProject(result, { capabilityManifests: manifests, outDir })
    const { readFileSync } = await import('node:fs')
    const map = JSON.parse(readFileSync(join(outDir, '.mdt-map.json'), 'utf8')) as {
      entries: Record<string, { kind: string; file: string; line?: number; symbol?: string }>
    }
    const homePage = map.entries['01990000-7000-7000-8000-010000000001']
    expect(homePage).toMatchObject({
      kind: 'page',
      file: 'src/pages/HomePage.tsx',
      symbol: 'HomePage',
    })
    expect(homePage?.line).toBeGreaterThan(0)
    const chat = map.entries['01990000-7000-7000-8000-020000000005']
    expect(chat).toMatchObject({ kind: 'element', file: 'src/pages/HomePage.tsx' })
    expect(chat?.line).toBeGreaterThan(0)
    const agent = map.entries['01990000-7000-7000-8000-030000000001']
    expect(agent).toMatchObject({ kind: 'agent', file: 'server/agents.config.json' })
    const interaction = map.entries['01990000-7000-7000-8000-050000000001']
    expect(interaction).toMatchObject({ kind: 'interaction', symbol: 'run_0' })
  })

  test('emitted capability modules are deterministic and executable', async () => {
    const { filesA } = generateTwice()
    const outDir = trackDir(mkdtempSync(join(tmpdir(), 'mdt-cap-')))
    writeFileSync(join(outDir, 'package.json'), JSON.stringify({ type: 'module' }))
    for (const id of ['web_fetch', 'web_search', 'datetime']) {
      const file = filesA.files.find(
        (candidate) => candidate.path === `server/capabilities/${id}.js`,
      )
      expect(file, `${id}.js emitted`).toBeDefined()
      writeFileSync(join(outDir, `${id}.js`), file?.content ?? '')
    }
    // the json runtime ships with the generator (not used by the golden blueprint)
    const jsonSource = readFileSync(
      new URL('../src/capability-runtime/json.js', import.meta.url),
      'utf8',
    )
    writeFileSync(join(outDir, 'json.js'), jsonSource)
    const datetime = await import(pathToFileURL(join(outDir, 'datetime.js')).href)
    const parsed = await datetime.execute(
      { operation: 'parse', value: '2026-01-02T03:04:05Z', timezone: 'UTC' },
      { secrets: {}, granted: new Set(), signal: new AbortController().signal, log: () => {} },
    )
    expect(parsed.iso).toBe('2026-01-02T03:04:05.000Z')

    const webSearch = await import(pathToFileURL(join(outDir, 'web_search.js')).href)
    const search = await webSearch.execute(
      { query: 'mdt deterministic', count: 3, provider: 'mock' },
      {
        secrets: {},
        granted: new Set(['network']),
        signal: new AbortController().signal,
        log: () => {},
      },
    )
    expect(search.provider).toBe('mock')
    expect(search.results).toHaveLength(3)
    expect(search.results[0]).toMatchObject({
      title: 'Mock result 1: mdt deterministic',
      url: 'https://example.test/mock/1?q=mdt%20deterministic',
    })

    const webFetch = await import(pathToFileURL(join(outDir, 'web_fetch.js')).href)
    expect(() => webFetch.assertUrlAllowed('http://127.0.0.1/x')).toThrow()
    expect(() => webFetch.assertUrlAllowed('file:///etc/passwd')).toThrow()
    expect(() => webFetch.assertUrlAllowed('http://169.254.169.254/latest/meta-data')).toThrow()
    await expect(
      webFetch.execute(
        { url: 'http://localhost:9999/x' },
        {
          secrets: {},
          granted: new Set(['network']),
          signal: new AbortController().signal,
          log: () => {},
        },
      ),
    ).rejects.toThrow(/blocked|localhostMode/)

    const json = await import(pathToFileURL(join(outDir, 'json.js')).href)
    const query = await json.execute({
      operation: 'parse',
      text: '{"a":{"b":[1,2]}}',
      path: 'a.b.1',
    })
    expect(query.result).toBe(2)
  })
})
