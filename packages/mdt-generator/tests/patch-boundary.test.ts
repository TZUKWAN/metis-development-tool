import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, test } from 'vitest'

import { generateProject, writeProject } from '../src/generator'
import type { CapabilityManifest } from '@mdt/capabilities'
import { builtinManifests, goldenBlueprint } from './helpers/blueprint'

const manifests = builtinManifests()
const dirs: string[] = []

function freshDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix))
  dirs.push(dir)
  return dir
}

afterEach(() => {
  while (dirs.length > 0) {
    const dir = dirs.pop()
    if (dir !== undefined) rmSync(dir, { recursive: true, force: true })
  }
})

describe('patch boundary (P11.19)', () => {
  test('user files survive regeneration; modified generator-owned files are overwritten + conflicts recorded', () => {
    const outDir = freshDir('mdt-patch-')
    const options = (): {
      capabilityManifests: Map<string, CapabilityManifest>
      outDir: string
    } => ({
      capabilityManifests: manifests,
      outDir,
    })

    // first generation
    const first = generateProject(goldenBlueprint(), options())
    writeProject(first, options())

    // user adds a brand-new file and edits it (NOT generator-owned)
    mkdirSync(join(outDir, 'docs'), { recursive: true })
    writeFileSync(join(outDir, 'docs', 'NOTES.md'), '# my notes v2\n')

    // user edits a generator-owned file
    const routesPath = join(outDir, 'src', 'routes.ts')
    const generatedRoutes = readFileSync(routesPath, 'utf8')
    writeFileSync(routesPath, `${generatedRoutes}\n// my local tweak\n`)

    // regenerate
    const second = generateProject(goldenBlueprint(), options())
    const { conflicts, removedPaths } = writeProject(second, options())

    // user file untouched
    expect(readFileSync(join(outDir, 'docs', 'NOTES.md'), 'utf8')).toBe('# my notes v2\n')
    // generator-owned file restored
    expect(readFileSync(routesPath, 'utf8')).toBe(generatedRoutes)
    // conflict recorded
    expect(conflicts.map((conflict) => conflict.path)).toEqual(['src/routes.ts'])
    expect(conflicts[0]?.reason).toContain('generator-owned')
    expect(removedPaths).toEqual([])
  })

  test('regeneration of an unchanged tree records no conflicts and is idempotent', () => {
    const outDir = freshDir('mdt-patch-idem-')
    const options = (): {
      capabilityManifests: Map<string, CapabilityManifest>
      outDir: string
    } => ({
      capabilityManifests: manifests,
      outDir,
    })
    const first = generateProject(goldenBlueprint(), options())
    writeProject(first, options())
    const second = generateProject(goldenBlueprint(), options())
    const { conflicts } = writeProject(second, options())
    expect(conflicts).toEqual([])
    const manifest = JSON.parse(
      readFileSync(join(outDir, '.mdt', 'generator-manifest.json'), 'utf8'),
    ) as { generatorOwnedPaths: string[]; blueprintHash: string }
    expect(manifest.generatorOwnedPaths.length).toBeGreaterThan(20)
    expect(manifest.generatorOwnedPaths).toContain('.mdt/generator-manifest.json')
  })

  test('stale generator-owned files are removed on regeneration', () => {
    const outDir = freshDir('mdt-patch-stale-')
    const options = (): {
      capabilityManifests: Map<string, CapabilityManifest>
      outDir: string
    } => ({
      capabilityManifests: manifests,
      outDir,
    })
    const first = generateProject(goldenBlueprint(), options())
    writeProject(first, options())
    // simulate the chat spec existing from a previous blueprint shape
    writeFileSync(join(outDir, 'tests', 'e2e', 'chat.spec.ts'), '// stale\n')
    const manifestPath = join(outDir, '.mdt', 'generator-manifest.json')
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
      generatorOwnedPaths: string[]
      fileHashes: Record<string, string>
    }
    // the stale file was written manually — hash mismatch makes it a conflict target if regenerated.
    // Instead simulate a path the generator no longer emits:
    manifest.generatorOwnedPaths.push('src/pages/RemovedOverlay.tsx')
    manifest.fileHashes['src/pages/RemovedOverlay.tsx'] = 'deadbeef'
    writeFileSync(manifestPath, JSON.stringify(manifest))
    writeFileSync(
      join(outDir, 'src', 'pages', 'RemovedOverlay.tsx'),
      'export {} // stale overlay\n',
    )

    const second = generateProject(goldenBlueprint(), options())
    const { removedPaths } = writeProject(second, options())
    expect(removedPaths).toContain('src/pages/RemovedOverlay.tsx')
    expect(() => readFileSync(join(outDir, 'src', 'pages', 'RemovedOverlay.tsx'))).toThrow()
  })
})
