/**
 * MDT build orchestrator (tasklist P10.05, P10.10, P10.12-P10.17, P10.20).
 *
 * Pipeline: Blueprint → generator (deterministic scaffold into the
 * generated workspace) → Codex turn(s) implementing design intent on a
 * build branch → quality gates (typecheck → unit → e2e) → repair loop
 * (bounded) → apply (ff-merge + known-good tag) or discard/rollback.
 * Every stage appends redacted JSONL to the build log.
 */
import fs from 'node:fs'
import path from 'node:path'

import { z } from 'zod'

import { parseProject, toBuildBlueprint } from '@mdt/schema'

import { runBuildPipeline } from './build-pipeline'
import { builderPrompt } from '@mdt/generator'
import {
  AppServerCodexClient,
  BuildLog,
  FakeCodexClient,
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
    void runBuild(build, deps, args.task, blueprint.project, session.root, contractPrompt).finally(
      () => {
        active = undefined
      },
    )
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
  const listener = (event: CodexEvent) => {
    build.log.append('codex_event', { event })
    pushEvent(build.id, event)
  }
  const result = await runBuildPipeline({
    buildId: build.id,
    workspace: build.workspace,
    project,
    projectRoot,
    task,
    contractPrompt,
    client: build.client,
    generate: deps.generate,
    gates: deps.gates ?? [
      { name: 'install', command: 'npm', args: ['install', '--no-audit', '--no-fund'] },
      { name: 'build', command: 'npm', args: ['run', 'build'] },
      { name: 'test', command: 'npm', args: ['test'] },
    ],
    maxRepairTurns: deps.maxRepairTurns,
    log: build.log,
    onEvent: listener,
    isCancelled: () => build.cancelRequested,
  })
  void result
}

export function activeBuildId(): string | undefined {
  return active?.id
}
