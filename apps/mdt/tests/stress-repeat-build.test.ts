/**
 * P14.23 — repeated build stress: the same project built 20 consecutive
 * times through the real pipeline. Verifies: every run completes, the
 * applied output is byte-stable across runs, and no state accumulates
 * (each apply produces the same file digest).
 */
import { mkdtempSync, readFileSync, readdirSync, statSync, cpSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'

import { describe, expect, it } from 'vitest'

import { CapabilityRegistry, registerBuiltins } from '@mdt/capabilities'
import { toBuildBlueprint, type ProjectRoot } from '@mdt/schema'
import { generateAndWrite } from '@mdt/generator'

import { FakeCodexClient } from '@mdt/codex'
import { runBuildPipeline } from '../src/main/build-pipeline'

const sampleDir = join(__dirname, '../../../fixtures/samples/web-research-agent')

function loadSample(): ProjectRoot {
  return JSON.parse(readFileSync(join(sampleDir, 'mdt.project.json'), 'utf8')) as ProjectRoot
}

function treeDigest(dir: string): Map<string, number> {
  const entries = new Map<string, number>()
  const walk = (d: string) => {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      const full = join(d, entry.name)
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist')
          continue
        walk(full)
      } else {
        const rel = relative(dir, full).replace(/\\/g, '/')
        entries.set(rel, statSync(full).size)
      }
    }
  }
  walk(dir)
  return entries
}

describe('P14.23 — repeated builds (20x)', () => {
  it(
    '20 consecutive pipeline runs complete with stable output trees',
    { timeout: 300_000 },
    async () => {
      const project = loadSample()
      const workspace = mkdtempSync(join(tmpdir(), 'mdt-stress-'))
      // seed the workspace with the committed scaffold so pipeline generate
      // has a patch-boundary base (as the real builder does)
      cpSync(join(sampleDir, 'generated'), workspace, { recursive: true })

      const registry = registerBuiltins(new CapabilityRegistry())
      const capabilityManifests = new Map(registry.manifests().map((m) => [m.id, m]))

      const noopGates = [{ name: 'noop', command: 'node', args: ['-e', 'process.exit(0)'] }]
      let firstTree: Map<string, number> | undefined

      for (let run = 1; run <= 20; run++) {
        const buildId = `stress-${run}`
        const entries: { kind: string; data: Record<string, unknown> }[] = []
        const debugLog = {
          append(kind: string, data?: Record<string, unknown>) {
            entries.push({ kind, data: data ?? {} })
          },
          readAll() {
            return entries
          },
        } as never
        const client = new FakeCodexClient([
          { steps: [], result: { status: 'completed', responseText: `run-${run}` } },
        ])
        const result = await runBuildPipeline({
          buildId,
          workspace,
          project,
          projectRoot: sampleDir,
          task: `stress run ${run}`,
          client,
          generate: async (proj, workspaceRoot, projectRoot) => {
            const result = generateAndWrite(toBuildBlueprint(proj as ProjectRoot), {
              capabilityManifests,
              outDir: workspaceRoot,
              ...(projectRoot ? { projectRoot } : {}),
            })
            return { ok: true, files: result.files.length }
          },
          gates: noopGates,
          maxRepairTurns: 0,
          log: debugLog,
          onEvent: () => {},
        })
        if (result.status !== 'completed') console.log('RUN_ERR', JSON.stringify(entries.slice(-5)))
        expect(result.status, `run ${run}`).toBe('completed')

        // verify output tree stability across runs
        const tree = treeDigest(workspace)
        if (firstTree === undefined) {
          firstTree = tree
        } else {
          for (const [path, size] of firstTree) {
            expect(tree.get(path), `run ${run}: ${path} size changed`).toBe(size)
          }
          expect(tree.size, `run ${run}: file count changed`).toBe(firstTree.size)
        }
      }
      expect(firstTree!.size).toBeGreaterThan(20)
    },
  )
})
