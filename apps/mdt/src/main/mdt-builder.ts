/**
 * MDT build orchestrator (tasklist P10.05, P10.10, P10.12-P10.17, P10.20).
 *
 * Pipeline: Blueprint → generator (deterministic scaffold into the
 * generated workspace) → Codex turn(s) implementing design intent on a
 * build branch → quality gates (typecheck → unit → e2e) → repair loop
 * (bounded) → apply (ff-merge + known-good tag) or discard/rollback.
 * Every stage appends redacted JSONL to the build log.
 */
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

import { z } from 'zod'

import { parseProject, toBuildBlueprint } from '@mdt/schema'

import { builderPrompt } from '@mdt/generator'
import {
  AppServerCodexClient,
  BuildLog,
  FakeCodexClient,
  applyBuild,
  commitBuild,
  diffSummary,
  discardBuild,
  prepareWorkspace,
  rollbackBuild,
  type CodexClient,
  type CodexEvent,
} from '@mdt/codex'
import { checkAvailability, resolveCodexBinary } from '@mdt/codex'
import { getMdtSession } from './mdt-io'

export interface BuildManagerDeps {
  /** project dir that hosts `generated/` workspaces */
  projectsRoot: () => string | undefined
  /** generator: blueprint → emitted files in the workspace (injected; wired to @mdt/generator at assembly) */
  generate: (
    blueprint: unknown,
    workspaceRoot: string,
    projectRoot?: string,
  ) => Promise<{ ok: boolean; error?: string; files?: number; warnings?: string[] }>
  /** quality gate commands run inside the workspace, in order */
  gates?: { name: string; command: string; args: string[] }[]
  maxRepairTurns?: number
}

const StartArgs = z.object({
  task: z.string().default('Implement the MDT blueprint for this project.'),
})

interface ActiveBuild {
  id: string
  workspace: string
  log: BuildLog
  client: CodexClient
  cancelRequested: boolean
}

let active: ActiveBuild | undefined
let webContentsSender: Electron.WebContents | undefined

export function attachBuildEvents(sender: Electron.WebContents): void {
  webContentsSender = sender
}

function pushEvent(buildId: string, event: CodexEvent): void {
  webContentsSender?.send('mdt:build-event', { buildId, event })
}

export function registerMdtBuildIpc(deps: GenerateDeps): void {
  ipcMain.handle('mdt:build-start', (_e, raw: unknown) => {
    const args = StartArgs.parse(raw ?? {})
    if (active) return { ok: false, error: 'a build is already running' }
    const session = getMdtSession()
    if (!session) return { ok: false, error: 'no project open' }
    const blueprint = parseProject(session.project)
    if (!blueprint.ok)
      return { ok: false, error: 'blueprint invalid', issues: blueprint.issues.slice(0, 10) }

    const buildId = `build-${Date.now().toString(36)}`
    const workspaceRoot = path.join(session.root, 'generated')
    fs.mkdirSync(workspaceRoot, { recursive: true })
    const log = new BuildLog(path.join(session.root, '.mdt', 'builds'), buildId)
    log.append('build_started', { task: args.task, workspace: path.basename(workspaceRoot) })

    const availability = checkAvailability()
    let client: CodexClient
    if (availability.installed && availability.loggedIn) {
      const { command } = resolveCodexBinary()
      client = new AppServerCodexClient(command)
    } else {
      // No Codex available: the deterministic fake client keeps the pipeline
      // exercisable (generator + gates still run for real) and the UI shows
      // the availability warning from mdt:build-availability.
      client = new FakeCodexClient([
        {
          steps: [
            {
              event: {
                type: 'agent_message_delta',
                delta: 'Codex unavailable — applying generated scaffold only.',
              },
            },
          ],
          result: { status: 'completed', responseText: 'scaffold only' },
        },
      ])
    }

    const build: ActiveBuild = {
      id: buildId,
      workspace: workspaceRoot,
      log,
      client,
      cancelRequested: false,
    }
    active = build
    const contractPrompt = builderPrompt(toBuildBlueprint(blueprint.project), args.task)
    void runBuild(build, deps, args.task, blueprint.project, session.root, contractPrompt).finally(() => {
      active = undefined
    })
    return { ok: true, buildId, warning: availability.compatWarning }
  })

  ipcMain.handle('mdt:build-cancel', () => {
    if (!active) return { ok: false, error: 'no build running' }
    active.cancelRequested = true
    void active.client.interrupt()
    active.log.append('cancelled', {})
    return { ok: true }
  })

  ipcMain.handle('mdt:build-availability', () => {
    return { ok: true, availability: checkAvailability() }
  })

  ipcMain.handle('mdt:build-rollback', () => {
    const session = getMdtSession()
    if (!session) return { ok: false, error: 'no project open' }
    const workspaceRoot = path.join(session.root, 'generated')
    const result = rollbackBuild(workspaceRoot)
    if (result.ok)
      webContentsSender?.send('mdt:build-event', {
        buildId: 'rollback',
        event: { type: 'session_ended' },
      })
    return result
  })
}

import { ipcMain } from 'electron'

type GenerateDeps = BuildManagerDeps

async function runBuild(
  build: ActiveBuild,
  deps: GenerateDeps,
  task: string,
  project: unknown,
  projectRoot?: string,
  contractPrompt?: string,
): Promise<void> {
  const events: CodexEvent[] = []
  const listener = (event: CodexEvent) => {
    events.push(event)
    build.log.append('codex_event', { event })
    pushEvent(build.id, event)
  }
  try {
    // 1) deterministic scaffold
    const generation = await deps.generate(project, build.workspace, projectRoot)
    if (!generation.ok) {
      build.log.append('failed', { stage: 'generate', error: generation.error })
      pushEvent(build.id, { type: 'error', message: generation.error ?? 'generation failed' })
      pushEvent(build.id, { type: 'turn_completed', status: 'failed', error: generation.error })
      return
    }
    pushEvent(build.id, {
      type: 'file_change_completed',
      files: [`scaffold (${generation.files ?? 0} files)`],
    })

    // 2) codex turn(s) with bounded repair loop
    await build.client.start(listener)
    const ws = prepareWorkspace(build.workspace, build.id)
    let turnResult = await build.client.turn(contractPrompt ?? task, {
      cwd: build.workspace,
      sandbox: 'workspace-write',
      timeoutMs: 15 * 60_000,
    })
    build.log.append('codex_event', { turn: turnResult })

    // 3) quality gates with bounded repair loop (P10.16)
    // Quality gates (tasklist 4.2 step 18): the generated app must build
    // (vite build = strict TS + bundling) and pass its test suite (vitest
    // unit + Playwright e2e with mocked SSE) before it can be applied.
    const gates = deps.gates ?? [
      { name: 'build', command: 'npm', args: ['run', 'build'] },
      { name: 'test', command: 'npm', args: ['test'] },
    ]
    let gateReport = await runGates(build, gates)
    let repairs = 0
    const maxRepairs = deps.maxRepairTurns ?? 2
    while (!gateReport.ok && repairs < maxRepairs && !build.cancelRequested) {
      repairs += 1
      build.log.append('quality_gate', { stage: 'repair', attempt: repairs, report: gateReport })
      const repairPrompt = [
        'The last build failed quality gates. Fix the reported errors in the existing code.',
        `Gate output:\n${gateReport.output.slice(0, 8_000)}`,
        'Do not rewrite unaffected files. Run nothing outside the workspace.',
      ].join('\n\n')
      turnResult = await build.client.turn(repairPrompt, {
        cwd: build.workspace,
        sandbox: 'workspace-write',
        timeoutMs: 15 * 60_000,
      })
      gateReport = await runGates(build, gates)
    }
    build.log.append('quality_gate', { stage: 'final', report: gateReport })

    if (build.cancelRequested) {
      discardBuild(ws)
      build.log.append('cancelled', {})
      pushEvent(build.id, {
        type: 'turn_completed',
        status: 'interrupted',
        error: 'cancelled by user',
      })
      return
    }

    if (!gateReport.ok) {
      discardBuild(ws)
      build.log.append('failed', { stage: 'gates', report: gateReport })
      pushEvent(build.id, {
        type: 'turn_completed',
        status: 'failed',
        error: `quality gates failed after ${repairs} repair turn(s)`,
      })
      return
    }

    // 4) apply: commit + ff-merge + known-good tag
    const commit = commitBuild(ws, `build(${build.id}): ${task.slice(0, 60)}`)
    const applied = applyBuild(ws, commit, build.id)
    if (!applied.ok) {
      build.log.append('failed', { stage: 'apply', error: applied.error })
      pushEvent(build.id, { type: 'turn_completed', status: 'failed', error: applied.error })
      return
    }
    const { stat } = diffSummary(ws)
    build.log.append('applied', { commit, stat: stat.slice(0, 2_000) })
    pushEvent(build.id, { type: 'turn_completed', status: 'completed' })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    build.log.append('failed', { error: message })
    pushEvent(build.id, { type: 'error', message })
    pushEvent(build.id, { type: 'turn_completed', status: 'failed', error: message })
  } finally {
    await build.client.dispose().catch(() => {})
  }
}

interface GateReport {
  ok: boolean
  output: string
  gates: { name: string; ok: boolean; output: string }[]
}

async function runGates(
  build: ActiveBuild,
  gates: { name: string; command: string; args: string[] }[],
): Promise<GateReport> {
  const results: GateReport['gates'] = []
  for (const gate of gates) {
    const output = await runCommand(gate.command, gate.args, build.workspace, 10 * 60_000)
    build.log.append('quality_gate', {
      gate: gate.name,
      code: output.code,
      output: output.text.slice(0, 4_000),
    })
    results.push({ name: gate.name, ok: output.code === 0, output: output.text.slice(0, 4_000) })
    if (output.code !== 0) break // first failure feeds the repair loop
  }
  return {
    ok: results.every((r) => r.ok),
    output: results.map((r) => `$ ${r.name}\n${r.output}`).join('\n'),
    gates: results,
  }
}

function runCommand(
  command: string,
  args: string[],
  cwd: string,
  timeoutMs: number,
): Promise<{ code: number | null; text: string }> {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd,
      shell: process.platform === 'win32',
      env: process.env,
    })
    let text = ''
    const collect = (chunk: Buffer | string) => {
      if (text.length < 200_000) text += chunk.toString()
    }
    child.stdout?.on('data', collect)
    child.stderr?.on('data', collect)
    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs)
    child.on('exit', (code) => {
      clearTimeout(timer)
      resolve({ code, text })
    })
    child.on('error', (err) => {
      clearTimeout(timer)
      resolve({ code: -1, text: err.message })
    })
  })
}

export function activeBuildId(): string | undefined {
  return active?.id
}
