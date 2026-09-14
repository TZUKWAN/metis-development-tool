/**
 * MDT deterministic generator (tasklist P11).
 *
 * BuildBlueprint in → complete standalone web-agent app out
 * (templates/web-agent scaffold + generated project files). Same blueprint
 * ⇒ byte-identical file tree: files are sorted, serialization is stable, no
 * timestamps or machine state enter the output.
 *
 * Patch boundary (P11.19): `.mdt/generator-manifest.json` records every
 * generator-owned path + content hash. Regenerating into an existing
 * directory overwrites generator-owned files, keeps everything else, and
 * records locally-modified generator-owned files as conflicts.
 */
import { createHash } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

import { blueprintHash, type BuildBlueprint, type Element } from '@mdt/schema'
import type { CapabilityManifest } from '@mdt/capabilities'

import {
  emitEnvExample,
  emitChatSpec,
  emitNavigationSpec,
  emitReadme,
  emitSmokeSpec,
  interactionView,
} from './emit/meta.js'
import { planFrontend } from './emit/pages.js'
import { emitServer } from './emit/server.js'
import { lineOf } from './naming.js'
import { lintBlueprint } from './lint.js'
import {
  GeneratorRefusedError,
  type CopiedAsset,
  type GenerateOptions,
  type GeneratedFile,
  type GenerationResult,
  type MdtSourceMap,
  type PatchConflict,
  type SourceMapEntry,
} from './types.js'

export const GENERATOR_VERSION = '0.1.0'

const DEFAULT_TEMPLATE_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  'templates',
  'web-agent',
)

/** Generated-per-project paths — the template's pre-generation defaults for
 * these paths are skipped when reading the base scaffold. */
const GENERATED_PATHS = [
  '.env.example',
  'README.md',
  'package.json',
  'src/routes.ts',
  'src/generated-variables.ts',
  'server/agents.config.json',
]
const GENERATED_DIRS = ['src/pages/', 'server/capabilities/', 'tests/e2e/', '.mdt/']
const ALWAYS_SKIP = new Set([
  '.env',
  'node_modules',
  'dist',
  '.git',
  'playwright-report',
  'test-results',
  '.mdt-map.json',
])

function isGeneratedPath(path: string): boolean {
  if (GENERATED_PATHS.includes(path)) return true
  return GENERATED_DIRS.some((dir) => path.startsWith(dir))
}

function listTemplateFiles(root: string, prefix = ''): string[] {
  const entries = readdirSync(root, { withFileTypes: true })
  const files: string[] = []
  for (const entry of entries) {
    if (ALWAYS_SKIP.has(entry.name)) continue
    const relative = prefix === '' ? entry.name : `${prefix}/${entry.name}`
    if (entry.isDirectory()) {
      files.push(...listTemplateFiles(join(root, entry.name), relative))
    } else if (entry.isFile()) {
      files.push(relative)
    }
  }
  return files
}

export function templateDirFor(options: GenerateOptions): string {
  return options.templateDir ?? DEFAULT_TEMPLATE_DIR
}

/**
 * Pure generation: lint (refuses on errors), assemble every file, build the
 * source map. Deterministic — same inputs, byte-identical outputs.
 */
export function generateProject(
  blueprint: BuildBlueprint,
  options: GenerateOptions,
): GenerationResult {
  // P11.22: refuse to emit when lint reports error-severity issues
  const lint = lintBlueprint(blueprint, options.capabilityManifests)
  if (!lint.ok) {
    throw new GeneratorRefusedError(lint.issues)
  }

  const warnings: string[] = []
  const files = new Map<string, GeneratedFile>()

  // ---- base scaffold (templates/web-agent) ----
  const templateDir = templateDirFor(options)
  for (const relative of listTemplateFiles(templateDir)) {
    if (isGeneratedPath(relative)) continue // generator emits fresh content
    files.set(relative, {
      path: relative,
      content: readFileSync(join(templateDir, relative), 'utf8'),
    })
  }

  // ---- frontend (P11.04–P11.08) ----
  const frontend = planFrontend(blueprint, warnings)
  files.set('src/routes.ts', { path: 'src/routes.ts', content: frontend.routeFile })
  files.set('src/generated-variables.ts', {
    path: 'src/generated-variables.ts',
    content: frontend.variablesFile,
  })
  for (const file of [...frontend.pageFiles, ...frontend.overlayFiles]) {
    files.set(file.fileName, { path: file.fileName, content: file.content })
  }

  // ---- agent config + capabilities (P11.09–P11.11) ----
  const serverEmit = emitServer(blueprint, options.capabilityManifests, warnings)
  files.set(serverEmit.agentsConfigFile.path, serverEmit.agentsConfigFile)
  for (const file of serverEmit.capabilityFiles) {
    files.set(file.path, file)
  }
  files.set(serverEmit.capabilityIndexPath, {
    path: serverEmit.capabilityIndexPath,
    content: serverEmit.capabilityIndexContent,
  })

  // ---- e2e test baseline (P11.15) ----
  const view = interactionView(blueprint, frontend)
  files.set('tests/e2e/smoke.spec.ts', {
    path: 'tests/e2e/smoke.spec.ts',
    content: emitSmokeSpec(frontend.pages),
  })
  const navigationSpec = emitNavigationSpec(view)
  if (navigationSpec !== null) {
    files.set('tests/e2e/navigation.spec.ts', {
      path: 'tests/e2e/navigation.spec.ts',
      content: navigationSpec,
    })
  }
  const chatSpec = emitChatSpec(view)
  if (chatSpec !== null) {
    files.set('tests/e2e/chat.spec.ts', { path: 'tests/e2e/chat.spec.ts', content: chatSpec })
  }

  // ---- package.json with dependency overrides applied verbatim ----
  files.set('package.json', {
    path: 'package.json',
    content: emitPackageJson(templateDir, blueprint.settings.generator.dependencyOverrides),
  })

  // ---- env + readme (P11.13/P11.14) ----
  files.set('.env.example', {
    path: '.env.example',
    content: emitEnvExample(blueprint),
  })
  const hash16 = blueprintHash(blueprint).slice(0, 16)
  const readme = emitReadme({
    blueprint,
    routeTable: frontend.pages.map((plan) => ({ path: plan.routePath, pageName: plan.page.name })),
    agents: blueprint.agents.map((agent) => ({
      name: agent.name,
      model: agent.modelPolicy.model,
      provider: agent.modelPolicy.provider,
      capabilities: agent.capabilityRefs
        .map(
          (ref) =>
            blueprint.capabilities.find((instance) => instance.id === ref)?.capabilityId ?? ref,
        )
        .sort(),
    })),
    warnings,
    generatorVersion: GENERATOR_VERSION,
  })
  files.set('README.md', { path: 'README.md', content: readme })

  // ---- source map (P11.18): mdt id → file + symbol/line hints ----
  const map = buildSourceMap(blueprint, frontend, hash16, files)

  // ---- generator manifest payload (P11.19) — content finalized at write time ----
  const manifestPath = '.mdt/generator-manifest.json'
  const ownedPaths = [...files.keys(), manifestPath].sort()
  files.set(manifestPath, {
    path: manifestPath,
    content: JSON.stringify(
      {
        generator: '@mdt/generator',
        generatorVersion: GENERATOR_VERSION,
        blueprintHash: blueprintHash(blueprint),
        generatorOwnedPaths: ownedPaths,
        fileHashes: Object.fromEntries(
          [...files.values()]
            .map((file) => [file.path, sha256(file.content)])
            .sort(([a], [b]) => a.localeCompare(b)),
        ),
      },
      null,
      2,
    ).concat('\n'),
  })

  // ---- binary assets: recorded for copy at write time ----
  const copiedAssets: CopiedAsset[] = []
  for (const asset of blueprint.assets) {
    const base = asset.path.slice('assets/'.length)
    const from =
      options.projectRoot !== undefined ? join(options.projectRoot, ...asset.path.split('/')) : null
    const to = join(options.outDir, 'public', 'assets', ...base.split('/'))
    if (from === null || !existsSync(from)) {
      warnings.push(
        `asset ${asset.path} not found under the project root — copiedAssets entry skipped`,
      )
      continue
    }
    copiedAssets.push({ from, to })
    map.entries[asset.id] = {
      kind: 'asset',
      file: `public/assets/${base}`,
    }
  }

  // ---- deterministic file order ----
  const sorted = [...files.values()].sort((a, b) => a.path.localeCompare(b.path))
  return {
    files: sorted,
    copiedAssets,
    map,
    conflicts: [], // filled by writeProject
    warnings,
  }
}

function emitPackageJson(templateDir: string, dependencyOverrides: Record<string, string>): string {
  const raw = readFileSync(join(templateDir, 'package.json'), 'utf8')
  const parsed = JSON.parse(raw) as {
    name: string
    version: string
    private: boolean
    license: string
    type: string
    description: string
    engines: Record<string, string>
    scripts: Record<string, string>
    dependencies: Record<string, string>
    devDependencies: Record<string, string>
  }
  // settings.generator.dependencyOverrides pins are applied verbatim
  const dependencies: Record<string, string> = { ...parsed.dependencies }
  const devDependencies: Record<string, string> = { ...parsed.devDependencies }
  for (const [name, version] of Object.entries(dependencyOverrides)) {
    if (name in devDependencies) devDependencies[name] = version
    else dependencies[name] = version
  }
  const sortKeys = (record: Record<string, string>): Record<string, string> =>
    Object.fromEntries(Object.entries(record).sort(([a], [b]) => a.localeCompare(b)))
  const ordered = {
    name: parsed.name,
    version: parsed.version,
    private: parsed.private,
    license: parsed.license,
    type: parsed.type,
    description: parsed.description,
    engines: parsed.engines,
    scripts: parsed.scripts,
    dependencies: sortKeys(dependencies),
    devDependencies: sortKeys(devDependencies),
  }
  return `${JSON.stringify(ordered, null, 2)}\n`
}

function buildSourceMap(
  blueprint: BuildBlueprint,
  frontend: ReturnType<typeof planFrontend>,
  hash16: string,
  files: Map<string, GeneratedFile>,
): MdtSourceMap {
  const entries: Record<string, SourceMapEntry> = {}
  const line = (path: string, marker: string): number | undefined => {
    const file = files.get(path)
    if (file === undefined) return undefined
    return lineOf(file.content, marker)
  }

  for (const plan of frontend.pages) {
    entries[plan.page.id] = {
      kind: 'page',
      file: plan.fileName,
      symbol: plan.componentName,
      line: line(plan.fileName, `data-mdt-page`),
    }
  }
  for (const plan of frontend.overlays) {
    entries[plan.page.id] = {
      kind: 'overlay',
      file: plan.fileName,
      symbol: plan.componentName,
      line: line(plan.fileName, `data-overlay-kind="${plan.kind}"`),
    }
  }
  const symbolByFile = new Map<string, string>()
  for (const plan of [...frontend.pages, ...frontend.overlays]) {
    symbolByFile.set(plan.fileName, plan.componentName)
  }
  for (const page of blueprint.pages) {
    const file = [...frontend.pages, ...frontend.overlays].find(
      (plan) => plan.page.id === page.id,
    )?.fileName
    if (file === undefined) continue
    const visit = (element: Element): void => {
      entries[element.id] = {
        kind: 'element',
        file,
        symbol: symbolByFile.get(file),
        // semantic components carry mdtId='<id>'; raw elements carry
        // data-mdt-id='<id>' — line hint resolves either marker
        line: line(file, `data-mdt-id='${element.id}'`) ?? line(file, `mdtId='${element.id}'`),
      }
      element.children.forEach(visit)
    }
    page.elements.forEach(visit)
  }
  for (const agent of blueprint.agents) {
    entries[agent.id] = {
      kind: 'agent',
      file: 'server/agents.config.json',
      symbol: agent.name,
      line: line('server/agents.config.json', JSON.stringify(agent.id)),
    }
  }
  for (const instance of blueprint.capabilities) {
    entries[instance.id] = {
      kind: 'capability-instance',
      file: `server/capabilities/${instance.capabilityId}.js`,
      symbol: instance.capabilityId,
      line: line('server/capabilities/index.js', JSON.stringify(instance.id)),
    }
  }
  for (const variable of blueprint.variables) {
    entries[variable.id] = {
      kind: 'variable',
      file: 'src/generated-variables.ts',
      symbol: variable.name,
      line: line('src/generated-variables.ts', JSON.stringify(variable.id)),
    }
  }
  for (const binding of blueprint.bindings) {
    entries[binding.id] = {
      kind: 'binding',
      file: 'src/generated-variables.ts',
      symbol: undefined,
      line: undefined,
    }
  }
  for (const interaction of blueprint.interactions) {
    // interactions are inlined into their host page file as run_<n> handlers
    const hostPage = [...frontend.pages, ...frontend.overlays].find(
      (plan) => plan.page.id === interaction.sourcePageId,
    )
    const index = blueprint.interactions.indexOf(interaction)
    if (hostPage === undefined) continue
    const marker = `// interaction ${interaction.id} (`
    entries[interaction.id] = {
      kind: 'interaction',
      file: hostPage.fileName,
      symbol: `run_${index}`,
      line: line(hostPage.fileName, marker),
    }
  }
  return { blueprintHash: `${hash16}`, entries }
}

function sha256(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex')
}

// ---------------------------------------------------------------------------
// writing (patch boundary)
// ---------------------------------------------------------------------------

/** Convenience: generate + write in one call. */
export function generateAndWrite(
  blueprint: BuildBlueprint,
  options: GenerateOptions,
): GenerationResult {
  const result = generateProject(blueprint, options)
  const { conflicts } = writeProject(result, options)
  return { ...result, conflicts }
}

/** Write the generated project into `outDir`, honoring the patch boundary. */
export function writeProject(
  result: GenerationResult,
  options: GenerateOptions,
): { conflicts: PatchConflict[]; removedPaths: string[] } {
  const outDir = options.outDir
  mkdirSync(outDir, { recursive: true })

  const manifestPath = join(outDir, '.mdt', 'generator-manifest.json')
  const previous = readPreviousManifest(manifestPath)

  const conflicts: PatchConflict[] = []
  const emittedPaths = new Set(result.files.map((file) => file.path))

  for (const file of result.files) {
    const absolute = join(outDir, ...file.path.split('/'))
    const diskContent = existsSync(absolute) ? readFileSync(absolute, 'utf8') : null
    if (diskContent !== null && diskContent !== file.content) {
      const previousHash = previous?.fileHashes?.[file.path]
      // generator-owned and locally modified → conflict, then overwrite
      if (previousHash !== undefined && sha256(diskContent) !== previousHash) {
        conflicts.push({
          path: file.path,
          reason: 'generator-owned file was modified locally; regenerated content restored',
          previousDiskHash: sha256(diskContent),
        })
      }
    }
    mkdirSync(dirname(absolute), { recursive: true })
    writeFileSync(absolute, file.content, 'utf8')
  }

  // binary assets
  for (const asset of result.copiedAssets) {
    mkdirSync(dirname(asset.to), { recursive: true })
    writeFileSync(asset.to, readFileSync(asset.from))
  }

  // previously generator-owned files the generator no longer emits → remove
  const removedPaths: string[] = []
  if (previous !== null) {
    for (const path of previous.generatorOwnedPaths ?? []) {
      if (emittedPaths.has(path) || path === '.mdt-map.json') continue
      const absolute = join(outDir, ...path.split('/'))
      if (existsSync(absolute)) {
        unlinkSync(absolute)
        removedPaths.push(path)
      }
    }
  }

  // refresh the source map artifact next to the manifest
  writeFileSync(join(outDir, '.mdt-map.json'), `${JSON.stringify(result.map, null, 2)}\n`, 'utf8')
  return { conflicts, removedPaths }
}

interface PreviousManifest {
  generatorOwnedPaths?: string[]
  fileHashes?: Record<string, string>
}

function readPreviousManifest(manifestPath: string): PreviousManifest | null {
  try {
    if (!existsSync(manifestPath)) return null
    return JSON.parse(readFileSync(manifestPath, 'utf8')) as PreviousManifest
  } catch {
    return null // corrupt manifest → treat as absent (all writes win)
  }
}
