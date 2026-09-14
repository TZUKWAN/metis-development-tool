/**
 * Preview process manager (tasklist P12.02, P12.03, P15.08).
 *
 * Runs the generated app's dev server as a managed child process:
 *  - free-port selection before spawn (no port fighting between previews)
 *  - health polling against `/api/health` (or any probe path) until ready
 *  - stop/restart with process-tree kill (taskkill /T on Windows) so no
 *    orphan servers survive MDT
 *  - stdout/stderr tail captured (capped) for the preview console panel
 */
import { spawn, type ChildProcess } from 'node:child_process'
import net from 'node:net'
import path from 'node:path'

export interface PreviewOptions {
  /** workspace dir containing the generated app (package.json with a dev script) */
  workspaceDir: string
  /** preferred port; when taken (or 0) a free port is picked */
  preferredPort?: number
  /** probe path polled until the server responds */
  healthPath?: string
  readyTimeoutMs?: number
  env?: Record<string, string>
  /** override the dev command (default: npm run dev) */
  command?: string
  args?: string[]
}

export interface PreviewInfo {
  url: string
  port: number
  pid: number | undefined
}

export class PreviewManager {
  private child: ChildProcess | undefined
  private info: PreviewInfo | undefined
  private tail: string[] = []

  get current(): PreviewInfo | undefined {
    return this.info
  }

  /** Captured console tail (newest last), capped at 500 lines (P12.05). */
  get consoleTail(): string[] {
    return [...this.tail]
  }

  async start(options: PreviewOptions): Promise<PreviewInfo> {
    if (this.child) throw new Error('preview already running — stop() first')
    const port = await pickPort(options.preferredPort ?? 0)
    const command = options.command ?? 'npm'
    const args = options.args ?? ['run', 'dev', '--', '--port', String(port), '--strictPort']
    const child = spawn(command, args, {
      cwd: options.workspaceDir,
      env: { ...process.env, ...options.env, PORT: String(port) },
      shell: process.platform === 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })
    this.child = child
    const collect = (chunk: Buffer | string) => {
      this.tail.push(String(chunk).trimEnd())
      if (this.tail.length > 500) this.tail.splice(0, this.tail.length - 500)
    }
    child.stdout?.on('data', collect)
    child.stderr?.on('data', collect)
    child.on('exit', (code) => {
      this.tail.push(`[preview exited with code ${code}]`)
      this.child = undefined
    })

    const url = `http://localhost:${port}`
    const ready = await waitForHealth(
      `${url}${options.healthPath ?? '/api/health'}`,
      options.readyTimeoutMs ?? 60_000,
    ).catch(() => false)
    if (!ready) {
      const tailSnapshot = this.tail.slice(-40).join('\n')
      await this.stop()
      throw new Error(`preview server did not become healthy at ${url}\n${tailSnapshot}`)
    }
    this.info = { url, port, pid: child.pid }
    return this.info
  }

  async stop(): Promise<void> {
    const child = this.child
    if (!child || child.pid === undefined) return
    this.child = undefined
    await killTree(child.pid)
    // give the port a moment to close so restarts are reliable
    await new Promise((r) => setTimeout(r, 150))
  }

  async restart(options: PreviewOptions): Promise<PreviewInfo> {
    await this.stop()
    // stick to the previous port when the caller did not express one, so a
    // restart is invisible to anything pointed at the old URL
    const preferred = options.preferredPort ?? this.info?.port ?? 0
    return this.start({ ...options, preferredPort: preferred })
  }
}

/** Ask the OS for a free port (0 = ephemeral), or verify the preferred one. */
export async function pickPort(preferred: number): Promise<number> {
  if (preferred > 0 && (await isFree(preferred))) return preferred
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.unref()
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      const port = typeof address === 'object' && address ? address.port : 0
      server.close(() => resolve(port))
    })
  })
}

async function isFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer()
    server.unref()
    server.once('error', () => resolve(false))
    server.listen(port, '127.0.0.1', () => {
      server.close(() => resolve(true))
    })
  })
}

async function waitForHealth(url: string, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 1_500)
      const response = await fetch(url, { signal: controller.signal })
      clearTimeout(timer)
      if (response.ok) return true
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 400))
  }
  return false
}

/** Cross-platform process-tree kill (P12.03: no orphan servers). */
export async function killTree(pid: number): Promise<void> {
  if (process.platform === 'win32') {
    await new Promise<void>((resolve) => {
      const taskkill = spawn('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true })
      taskkill.on('exit', () => resolve())
      taskkill.on('error', () => resolve())
    })
    return
  }
  try {
    process.kill(-pid, 'SIGKILL')
  } catch {
    try {
      process.kill(pid, 'SIGKILL')
    } catch {
      // already gone
    }
  }
}

/** Resolve the dev-server entry for a generated app (workspace layout). */
export function workspaceDevEntry(workspaceDir: string): string {
  return path.join(workspaceDir, 'server', 'index.js')
}
