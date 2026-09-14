/**
 * App-server transport (tasklist P10.02, P10.05, P10.06, P10.14; ADR-0005).
 *
 * Spawns `codex app-server` and speaks newline-delimited JSON-RPC 2.0 over
 * stdio. Protocol method/notification names verified against codex-cli
 * 0.144.1 via `codex app-server generate-json-schema` (see
 * docs/upstream/CODEX_BASELINE.md).
 *
 * Lifecycle: initialize → initialized → thread/start (cwd+sandbox pinned) →
 * turn/start → streaming item notifications → turn/completed. Cancel =
 * turn/interrupt then, as a last resort, process-tree kill. Dispose kills
 * the child so closing a project never leaks processes (P10.05).
 */
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'

import { JsonValueSchema, type JsonValue } from '@mdt/schema'

import { resolveCodexBinary } from './versions'
import type { CodexClient, CodexEventListener, CodexTurnOptions, CodexTurnResult } from './types'

const PROTOCOL_STUBS = {
  initialize: {
    clientInfo: { name: 'MDT', title: 'Metis Development Tool', version: '1.0.0' },
    capabilities: { experimentalApi: true },
  },
} as const

export class AppServerCodexClient implements CodexClient {
  readonly kind = 'app-server' as const

  /** Overridable for tests: spawn the app-server process. */
  protected spawnProcess(command: string, args: string[]): ChildProcessWithoutNullStreams {
    return spawn(command, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    }) as ChildProcessWithoutNullStreams
  }
  private child: ChildProcessWithoutNullStreams | undefined
  private listener: CodexEventListener | undefined
  private nextId = 1
  private pending = new Map<
    number,
    { resolve: (v: JsonValue) => void; reject: (e: Error) => void }
  >()
  private buffer = ''
  private threadId: string | undefined
  private turnId: string | undefined
  private activeOptions: CodexTurnOptions | undefined
  private responseText = ''

  constructor(private readonly binaryPath?: string) {}

  async start(listener: CodexEventListener): Promise<void> {
    this.listener = listener
    const { command, argsPrefix } = resolveCodexBinary(this.binaryPath)
    this.child = this.spawnProcess(command, [...argsPrefix, 'app-server'])
    this.child.stdout.setEncoding('utf8')
    this.child.stdout.on('data', (chunk: string) => this.onData(chunk))
    this.child.stderr.setEncoding('utf8')
    this.child.stderr.on('data', (chunk: string) => {
      const text = chunk.trim()
      if (text) this.listener?.({ type: 'error', message: `codex stderr: ${text.slice(0, 500)}` })
    })
    const exitedDuringHandshake = new Promise<never>((_, reject) => {
      this.child?.on('exit', (code) => {
        this.rejectAllPending(new Error(`codex app-server exited with code ${code}`))
        reject(new Error(`codex app-server exited (code ${code}) during handshake`))
      })
      this.child?.on('error', (err) => {
        this.rejectAllPending(err)
        reject(err)
      })
    })
    await Promise.race([
      this.request('initialize', PROTOCOL_STUBS.initialize),
      exitedDuringHandshake,
    ])
    // the losing promise may reject later (exit right after the handshake
    // response); swallow that late rejection — pending requests already got
    // rejected through rejectAllPending
    exitedDuringHandshake.catch(() => {})
    this.notify('initialized', {})
  }

  private onData(chunk: string): void {
    this.buffer += chunk
    let index: number
    while ((index = this.buffer.indexOf('\n')) >= 0) {
      const line = this.buffer.slice(0, index).trim()
      this.buffer = this.buffer.slice(index + 1)
      if (!line) continue
      this.onMessage(line)
    }
  }

  private onMessage(line: string): void {
    let parsed: unknown
    try {
      parsed = JSON.parse(line)
    } catch {
      this.listener?.({ type: 'error', message: 'unparsable app-server line (truncated)' })
      return
    }
    const record = parsed as {
      id?: number
      result?: unknown
      error?: { message?: string }
      method?: string
      params?: Record<string, unknown>
    }
    if (typeof record.id === 'number' && (record.result !== undefined || record.error)) {
      const pending = this.pending.get(record.id)
      if (!pending) return
      this.pending.delete(record.id)
      if (record.error) pending.reject(new Error(record.error.message ?? 'app-server error'))
      else pending.resolve(record.result as JsonValue)
      return
    }
    if (record.method) this.onNotification(record.method, record.params ?? {})
  }

  private onNotification(method: string, params: Record<string, unknown>): void {
    const listener = this.listener
    if (!listener) return
    switch (method) {
      case 'thread/started':
        this.threadId = str((params as { thread?: { id?: string } }).thread?.id)
        listener({
          type: 'session_started',
          sessionId: this.threadId ?? 'unknown',
          threadId: this.threadId,
        })
        break
      case 'turn/started':
        this.turnId = str((params as { turn?: { id?: string } }).turn?.id) ?? str(params.turnId)
        break
      case 'item/agentMessage/delta': {
        const delta = str(params.delta)
        this.responseText += delta
        listener({ type: 'agent_message_delta', delta })
        break
      }
      case 'command/exec/outputDelta':
        listener({ type: 'command_output', text: str(params.delta ?? params.text).slice(0, 2_000) })
        break
      case 'turn/diff/updated':
        listener({ type: 'file_change_started' })
        break
      case 'turn/completed': {
        const turn = (params as { turn?: { status?: string; error?: { message?: string } } }).turn
        const status =
          turn?.status === 'interrupted'
            ? 'interrupted'
            : turn?.status === 'failed'
              ? 'failed'
              : 'completed'
        if (status === 'failed') {
          this.lastError = turn?.error?.message ?? 'turn failed'
          listener({ type: 'error', message: this.lastError })
        }
        listener({ type: 'turn_completed', status, error: turn?.error?.message })
        this.turnDone?.(status)
        this.turnDone = undefined
        break
      }
      case 'error':
        this.lastError = str(params.message)
        listener({ type: 'error', message: this.lastError })
        break
      default: {
        // item/started|completed carry command/fileChange items
        if (method.startsWith('item/')) this.onItem(method, params)
      }
    }
  }

  private onItem(method: string, params: Record<string, unknown>): void {
    const item = (params as { item?: Record<string, unknown> }).item
    if (!item) return
    const listener = this.listener!
    if (item.type === 'commandExecution') {
      if (method === 'item/started')
        listener({ type: 'command_started', command: str(item.command).slice(0, 500) })
      else if (method === 'item/completed')
        listener({
          type: 'command_completed',
          exitCode: typeof item.exitCode === 'number' ? item.exitCode : null,
        })
    } else if (item.type === 'fileChange' && method === 'item/completed') {
      const files = Array.isArray(item.changes)
        ? item.changes.map((c) => str((c as { path?: unknown }).path)).filter(Boolean)
        : []
      listener({ type: 'file_change_completed', files })
    }
  }

  async turn(prompt: string, options: CodexTurnOptions): Promise<CodexTurnResult> {
    if (!this.child) throw new Error('CodexClient.start() must be called before turn()')
    this.activeOptions = options
    this.responseText = ''
    const timeout = options.timeoutMs
      ? setTimeout(() => void this.interrupt(), options.timeoutMs)
      : undefined
    const onAbort = () => void this.interrupt()
    options.signal?.addEventListener('abort', onAbort, { once: true })
    try {
      if (!this.threadId) {
        const result = await (
          this.request as (m: string, p: Record<string, unknown>) => Promise<JsonValue>
        )('thread/start', {
          cwd: options.cwd,
          sandbox: options.sandbox ?? 'workspace-write',
          approvalPolicy: 'never',
          ...(options.networkAccess
            ? { config: { sandbox_workspace_write: { network_access: true } } }
            : {}),
          ...(options.model ? { model: options.model } : {}),
        })
        this.threadId = str((result as { thread?: { id?: string } }).thread?.id)
      }
      const status = await this.runTurn(prompt, options)
      const error =
        status === 'failed'
          ? this.lastError
          : status === 'interrupted'
            ? 'turn was interrupted'
            : undefined
      return { status, responseText: this.responseText, error }
    } finally {
      if (timeout) clearTimeout(timeout)
      options.signal?.removeEventListener('abort', onAbort)
      this.activeOptions = undefined
    }
  }

  private lastError: string | undefined
  private turnDone: ((status: 'completed' | 'interrupted' | 'failed') => void) | undefined

  /** Send turn/start and wait for turn/completed (or abort/timeout paths). */
  private runTurn(
    prompt: string,
    options: CodexTurnOptions,
  ): Promise<'completed' | 'interrupted' | 'failed'> {
    const done = new Promise<'completed' | 'interrupted' | 'failed'>((resolve) => {
      this.turnDone = resolve
    })
    if (this.threadId === undefined) {
      return Promise.reject(new Error('thread/start did not return a thread id'))
    }
    const request = this.request('turn/start', {
      threadId: this.threadId,
      input: [{ type: 'text', text: prompt }],
    })
    const abortAsInterrupt = new Promise<'interrupted'>((resolve) => {
      options.signal?.addEventListener('abort', () => resolve('interrupted'), { once: true })
    })
    return Promise.race([
      done,
      abortAsInterrupt,
      request
        .then(() => done)
        .catch((err) => {
          this.lastError = err instanceof Error ? err.message : String(err)
          return 'failed' as const
        }),
    ])
  }

  async interrupt(): Promise<void> {
    if (!this.threadId || !this.turnId) return
    try {
      await this.request('turn/interrupt', { threadId: this.threadId, turnId: this.turnId })
    } catch {
      // interrupting a finished turn errors — that is fine
    }
    this.killChild()
  }

  async dispose(): Promise<void> {
    this.killChild()
  }

  private killChild(): void {
    if (!this.child) return
    const child = this.child
    this.child = undefined
    this.rejectAllPending(new Error('codex session disposed'))
    if (process.platform === 'win32') {
      // tree-kill: codex may hold sandbox children
      spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true })
    } else {
      child.kill('SIGKILL')
    }
  }

  private rejectAllPending(error: Error): void {
    for (const [, pending] of this.pending) pending.reject(error)
    this.pending.clear()
  }

  private request(method: string, params: JsonValue): Promise<JsonValue> {
    const child = this.child
    if (!child) return Promise.reject(new Error('app-server not running'))
    const id = this.nextId++
    const line = JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n'
    const promise = new Promise<JsonValue>((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id)
          reject(new Error(`app-server request ${method} timed out`))
        }
      }, 30_000).unref?.()
    })
    child.stdin.write(line, (err) => {
      if (err) {
        const pending = this.pending.get(id)
        if (pending) {
          this.pending.delete(id)
          pending.reject(new Error(`codex app-server stdin closed (${err.message})`))
        }
      }
    })
    return promise
  }

  private notify(method: string, params: JsonValue): void {
    this.child?.stdin.write(JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n')
  }
}

function str(value: unknown): string {
  return typeof value === 'string'
    ? value
    : value === undefined || value === null
      ? ''
      : String(value)
}
