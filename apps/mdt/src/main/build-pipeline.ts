/**
 * Build pipeline core (tasklist P10.20, P14.15) — pure Node, no Electron,
 * so the integration suite drives the exact production pipeline.
 */
import fs from 'node:fs'
import path from 'node:path'

import { spawn } from 'node:child_process'

import {
  applyBuild,
  commitBuild,
  diffSummary,
  discardBuild,
  prepareWorkspace,
  type BuildLog,
  type CodexClient,
  type CodexEvent,
} from '@mdt/codex'

export interface BuildPipelineOptions {
  buildId: string
  workspace: string
  project: unknown
  projectRoot?: string
  task: string
  contractPrompt?: string
  client: CodexClient
  gates: { name: string; command: string; args: string[] }[]
  generate: (
    blueprint: unknown,
    workspaceRoot: string,
    projectRoot?: string,
  ) => Promise<{ ok: boolean; error?: string; files?: number }>
  maxRepairTurns?: number
  log: BuildLog
  onEvent: (event: CodexEvent) => void
  isCancelled?: () => boolean
}

export interface BuildPipelineResult {
  status: 'completed' | 'failed' | 'cancelled'
  error?: string
  repairs: number
}

/**
 * The full build pipeline (P10.20): generate → codex turn(s) → quality
 * gates with bounded repair → apply (commit + ff-merge + known-good tag)
 * or discard. Exported so the integration suite drives the exact
 * production pipeline against a fake client.
 */
export async function runBuildPipeline(
  options: BuildPipelineOptions,
): Promise<BuildPipelineResult> {
  const { buildId, workspace, client, log, onEvent } = options
  let cancelRequested = false
  try {
    // 1) deterministic scaffold
    const generation = await options.generate(options.project, workspace, options.projectRoot)
    if (!generation.ok) {
      log.append('failed', { stage: 'generate', error: generation.error })
      onEvent({ type: 'error', message: generation.error ?? 'generation failed' })
      onEvent({ type: 'turn_completed', status: 'failed', error: generation.error })
      return { status: 'failed', error: generation.error, repairs: 0 }
    }
    onEvent({ type: 'file_change_completed', files: [`scaffold (${generation.files ?? 0} files)`] })

    // 2) codex turn(s) with bounded repair loop
    await client.start(onEvent)
    const ws = prepareWorkspace(workspace, buildId)
    let turnResult = await client.turn(options.contractPrompt ?? options.task, {
      cwd: workspace,
      sandbox: 'workspace-write',
      timeoutMs: 15 * 60_000,
    })
    log.append('codex_event', { turn: turnResult })

    let gateReport = await runGates(options, log)
    let repairs = 0
    const maxRepairs = options.maxRepairTurns ?? 2
    while (!gateReport.ok && repairs < maxRepairs && !cancelRequested) {
      repairs += 1
      log.append('quality_gate', { stage: 'repair', attempt: repairs, report: gateReport })
      const repairPrompt = [
        'The last build failed quality gates. Fix the reported errors in the existing code.',
        `Gate output:\n${gateReport.output.slice(0, 8_000)}`,
        'Do not rewrite unaffected files. Run nothing outside the workspace.',
      ].join('\n\n')
      turnResult = await client.turn(repairPrompt, {
        cwd: workspace,
        sandbox: 'workspace-write',
        timeoutMs: 15 * 60_000,
      })
      gateReport = await runGates(options, log)
    }
    log.append('quality_gate', { stage: 'final', report: gateReport })

    if (cancelRequested || options.isCancelled?.()) {
      discardBuild(ws)
      log.append('cancelled', {})
      onEvent({ type: 'turn_completed', status: 'interrupted', error: 'cancelled by user' })
      return { status: 'cancelled', error: 'cancelled by user', repairs }
    }

    if (!gateReport.ok) {
      discardBuild(ws)
      log.append('failed', { stage: 'gates', report: gateReport })
      const error = `quality gates failed after ${repairs} repair turn(s)`
      onEvent({ type: 'turn_completed', status: 'failed', error })
      return { status: 'failed', error, repairs }
    }

    // 4) apply: commit + ff-merge + known-good tag
    const commit = commitBuild(ws, `build(${buildId}): ${options.task.slice(0, 60)}`)
    const applied = applyBuild(ws, commit, buildId)
    if (!applied.ok) {
      log.append('failed', { stage: 'apply', error: applied.error })
      onEvent({ type: 'turn_completed', status: 'failed', error: applied.error })
      return { status: 'failed', error: applied.error, repairs }
    }
    const { stat } = diffSummary(ws)
    log.append('applied', { commit, stat: stat.slice(0, 2_000) })
    onEvent({ type: 'turn_completed', status: 'completed' })
    return { status: 'completed', repairs }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    log.append('failed', { error: message })
    onEvent({ type: 'error', message })
    onEvent({ type: 'turn_completed', status: 'failed', error: message })
    return { status: 'failed', error: message, repairs: 0 }
  } finally {
    await client.dispose().catch(() => {})
  }
}

interface GateReport {
  ok: boolean
  output: string
  gates: { name: string; ok: boolean; output: string }[]
}

async function runGates(options: BuildPipelineOptions, log: BuildLog): Promise<GateReport> {
  const results: GateReport['gates'] = []
  for (const gate of options.gates) {
    const output = await runCommand(gate.command, gate.args, options.workspace, 10 * 60_000)
    log.append('quality_gate', {
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
