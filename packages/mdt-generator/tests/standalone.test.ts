/**
 * Standalone test (P11.21 — the critical one): generate the golden project,
 * copy it OUTSIDE the repo, `npm install --prefer-offline`, `npm run build`
 * and `npm run typecheck` + template unit tests must succeed, and the
 * generated package.json must contain NO @mdt/* dependencies and no
 * @openai/codex (P10.18).
 *
 * Opt out in CI with MDT_SKIP_STANDALONE=1; it runs locally by default.
 */
import { spawnSync } from 'node:child_process'
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, test } from 'vitest'

import { generateProject, writeProject } from '../src/generator'
import { builtinManifests, goldenBlueprint } from './helpers/blueprint'

const manifests = builtinManifests()

function npm(
  args: string[],
  cwd: string,
  timeoutMs = 600_000,
): { status: number; stdout: string; stderr: string } {
  const command = process.platform === 'win32' ? 'npm.cmd' : 'npm'
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    timeout: timeoutMs,
    // Windows: .cmd shims require a shell (Node EINVAL guard for .bat/.cmd)
    shell: process.platform === 'win32',
    env: { ...process.env, NO_COLOR: '1' },
  })
  return { status: result.status ?? -1, stdout: result.stdout ?? '', stderr: result.stderr ?? '' }
}

describe.skipIf(process.env.MDT_SKIP_STANDALONE === '1')('standalone generation (P11.21)', () => {
  test('generated app installs, builds, typechecks and unit-tests outside the repo', () => {
    // 1. generate inside a scratch dir, then copy OUTSIDE the repo
    const scratch = mkdtempSync(join(tmpdir(), 'mdt-standalone-scratch-'))
    const outside = mkdtempSync(join(tmpdir(), 'mdt-standalone-'))
    const generatedInside = join(scratch, 'project')
    const generated = join(outside, 'app')
    try {
      const options = {
        capabilityManifests: manifests,
        outDir: generatedInside,
        // the golden asset lives in a fake project root we create on the fly
      }
      const blueprint = goldenBlueprint()
      const fakeProjectRoot = mkdtempSync(join(tmpdir(), 'mdt-assets-'))
      const assetDir = join(fakeProjectRoot, 'assets')
      mkdirSync(assetDir, { recursive: true })
      writeFileSync(join(assetDir, `${blueprint.assets[0]?.path.slice('assets/'.length)}`), 'PNG')
      const result = generateProject(blueprint, { ...options, projectRoot: fakeProjectRoot })
      writeProject(result, { ...options, projectRoot: fakeProjectRoot })
      expect(result.copiedAssets).toHaveLength(1)

      cpSync(generatedInside, generated, { recursive: true })
      // the copy must be fully self-sufficient: no repo paths referenced
      expect(existsSync(join(generated, 'package.json'))).toBe(true)

      // 2. no @mdt/* dependencies, no @openai/codex (P11.21, P10.18)
      const pkg = JSON.parse(readFileSync(join(generated, 'package.json'), 'utf8')) as {
        dependencies: Record<string, string>
        devDependencies: Record<string, string>
      }
      const allDeps = [...Object.keys(pkg.dependencies), ...Object.keys(pkg.devDependencies)]
      for (const name of allDeps) {
        expect(name.startsWith('@mdt/'), `forbidden @mdt/* dependency: ${name}`).toBe(false)
        expect(name).not.toBe('@openai/codex')
      }
      expect(allDeps).toContain('@earendil-works/pi-agent-core')

      // 3. npm install (offline-friendly; network allowed)
      const install = npm(['install', '--prefer-offline', '--no-audit', '--no-fund'], generated)
      if (install.status !== 0) console.error(install.stdout, install.stderr)
      expect(install.status, 'npm install failed').toBe(0)

      // 4. production build
      const build = npm(['run', 'build'], generated)
      if (build.status !== 0) console.error(build.stdout, build.stderr)
      expect(build.status, 'vite build failed').toBe(0)
      expect(existsSync(join(generated, 'dist', 'index.html'))).toBe(true)

      // 5. strict typecheck of the generated sources (incl. generated pages)
      const typecheck = npm(['run', 'typecheck'], generated)
      if (typecheck.status !== 0) console.error(typecheck.stdout, typecheck.stderr)
      expect(typecheck.status, 'tsc --noEmit failed').toBe(0)

      // 6. unit tests (vitest + jsdom + mocked agent service)
      const unit = npm(['run', 'test:unit'], generated)
      if (unit.status !== 0) console.error(unit.stdout, unit.stderr)
      expect(unit.status, 'vitest failed').toBe(0)
    } finally {
      rmSync(scratch, { recursive: true, force: true })
      rmSync(outside, { recursive: true, force: true })
    }
  }, 900_000)
})
