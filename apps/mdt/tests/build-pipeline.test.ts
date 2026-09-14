/**
 * Build pipeline integration (tasklist P10.20, P14.15): drives the exact
 * production pipeline (runBuildPipeline) against the committed Web Research
 * sample with a deterministic fake Codex client — generation, install and
 * vite-build quality gates run for real; the LLM turn is scripted so CI
 * stays hermetic (real-Codex acceptance is a separate manual gate, P18.08).
 */
import { existsSync, mkdtempSync, readFileSync, cpSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { beforeAll, describe, expect, test } from 'vitest'

import { CapabilityRegistry, registerBuiltins, type CapabilityManifest } from '@mdt/capabilities'
import { BuildLog, FakeCodexClient, type CodexEvent } from '@mdt/codex'
import { toBuildBlueprint, type ProjectRoot } from '@mdt/schema'

import { generateAndWrite } from '@mdt/generator'
import { runBuildPipeline } from '../src/main/build-pipeline'

const repoRoot = join(__dirname, '../../..')
const sampleDir = join(repoRoot, 'fixtures/samples/web-research-agent')

let project: ProjectRoot
let manifests: Map<string, CapabilityManifest>

beforeAll(() => {
  const registry = registerBuiltins(new CapabilityRegistry())
  manifests = new Map(registry.manifests().map((m) => [m.id, m]))
  project = JSON.parse(readFileSync(join(sampleDir, 'mdt.project.json'), 'utf8')) as ProjectRoot
})

describe('build pipeline integration (P10.20, P14.15)', () => {
  test(
    'generate → fake codex turn → install+build gates → applied with known-good tag',
    { timeout: 600_000 },
    async () => {
      const scratch = mkdtempSync(join(tmpdir(), 'mdt-pipeline-'))
      // copy the sample's generated/ scaffold as the workspace the builder
      // would have produced (generation itself is covered by generator tests)
      cpSync(join(sampleDir, 'generated'), join(scratch, 'generated'), { recursive: true })
      const workspace = join(scratch, 'generated')

      const events: CodexEvent[] = []
      const log = new BuildLog(join(scratch, '.mdt', 'builds'), 'it-1')
      const client = new FakeCodexClient([
        {
          steps: [{ event: { type: 'agent_message_delta', delta: 'implementing' } }],
          result: { status: 'completed', responseText: 'done' },
        },
      ])

      log.append('build_started', { task: 'Implement the MDT blueprint.' }) // caller's job, as in mdt-builder
      const result = await runBuildPipeline({
        buildId: 'it-1',
        workspace,
        generate: async (proj, workspaceRoot, projectRoot) => {
          const result = generateAndWrite(toBuildBlueprint(proj as ProjectRoot), {
            capabilityManifests: manifests,
            outDir: workspaceRoot,
            ...(projectRoot ? { projectRoot } : {}),
          })
          return { ok: true, files: result.files.length }
        },
        project,
        projectRoot: sampleDir,
        task: 'Implement the MDT blueprint.',
        contractPrompt: 'contract prompt (covered by snapshot tests)',
        client,
        gates: [
          { name: 'install', command: 'npm', args: ['install', '--no-audit', '--no-fund'] },
          { name: 'build', command: 'npm', args: ['run', 'build'] },
        ],
        maxRepairTurns: 0,
        log,
        onEvent: (e) => events.push(e),
      })

      expect(result.status).toBe('completed')
      // quality gates ran for real: install + vite build
      expect(events.some((e) => e.type === 'turn_completed' && e.status === 'completed')).toBe(true)
      // last-known-good was recorded on the workspace
      const { execFileSync } = await import('node:child_process')
      const tags = execFileSync('git', ['-C', workspace, 'tag', '--list', 'mdt-known-good/*'], {
        encoding: 'utf8',
      })
      expect(tags).toContain('mdt-known-good/it-1')
      // the build log is auditable
      const entries = log.readAll()
      expect(entries.some((e) => e.kind === 'build_started')).toBe(true)
      expect(entries.some((e) => e.kind === 'applied')).toBe(true)
      // the fake client received the turn
      expect(client.turns).toHaveLength(1)
    },
  )
})
