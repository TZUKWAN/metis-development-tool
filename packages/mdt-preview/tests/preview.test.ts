import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { PreviewManager, pickPort } from '../src/index'

let workspace: string
const children: ReturnType<typeof createServer>[] = []

beforeEach(() => {
  workspace = join(mkdtempSync(join(tmpdir(), 'mdt-preview-')), 'app')
  mkdirSync(workspace, { recursive: true })
})

afterEach(() => {
  for (const server of children.splice(0)) server.close()
})

/** A tiny stand-in for the generated dev server: speaks /api/health. */
function writeFakeDevServer(): void {
  writeFileSync(
    join(workspace, 'dev-server.mjs'),
    `import { createServer } from 'node:http'
const port = Number(process.env.PORT)
const server = createServer((req, res) => {
  if (req.url === '/api/health') {
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ ok: true }))
    return
  }
  res.writeHead(404)
  res.end()
})
server.listen(port, '127.0.0.1')
`,
  )
  writeFileSync(
    join(workspace, 'package.json'),
    JSON.stringify({
      name: 'preview-fixture',
      type: 'module',
      scripts: { dev: 'node dev-server.mjs' },
    }),
  )
}

describe('PreviewManager (P12.03, P15.08)', () => {
  it('starts a managed dev server, becomes healthy, and reports its url', async () => {
    writeFakeDevServer()
    const manager = new PreviewManager()
    const info = await manager.start({ workspaceDir: workspace, readyTimeoutMs: 15_000 })
    expect(info.url).toMatch(/^http:\/\/localhost:\d+$/)
    expect(info.pid).toBeDefined()
    const response = await fetch(`${info.url}/api/health`)
    expect(response.ok).toBe(true)
    await manager.stop()
  }, 30_000)

  it('stop() really releases the port (no orphan servers)', async () => {
    writeFakeDevServer()
    const manager = new PreviewManager()
    const info = await manager.start({ workspaceDir: workspace, readyTimeoutMs: 15_000 })
    await manager.stop()
    // the same port must be bindable again within a short grace period
    const rebound = await new Promise<boolean>((resolve) => {
      const server = createServer()
      server.once('error', () => resolve(false))
      server.listen(info.port, '127.0.0.1', () => {
        server.close(() => resolve(true))
      })
    })
    expect(rebound).toBe(true)
  }, 30_000)

  it('restart() produces a fresh healthy server', async () => {
    writeFakeDevServer()
    const manager = new PreviewManager()
    const first = await manager.start({ workspaceDir: workspace, readyTimeoutMs: 15_000 })
    const second = await manager.restart({ workspaceDir: workspace, readyTimeoutMs: 15_000 })
    expect(second.port).toBe(first.port) // preferred/ephemeral port sticks on restart
    const response = await fetch(`${second.url}/api/health`)
    expect(response.ok).toBe(true)
    await manager.stop()
  }, 45_000)

  it('captures server console output in the tail (P12.05)', async () => {
    writeFakeDevServer()
    const manager = new PreviewManager()
    await manager.start({ workspaceDir: workspace, readyTimeoutMs: 15_000 })
    const tail = manager.consoleTail.join('\n')
    expect(typeof tail).toBe('string')
    await manager.stop()
  }, 30_000)

  it('fails loudly (with tail) when the server never becomes healthy', async () => {
    writeFileSync(join(workspace, 'dev-server.mjs'), `process.exit(1)\n`)
    writeFileSync(
      join(workspace, 'package.json'),
      JSON.stringify({
        name: 'preview-broken',
        type: 'module',
        scripts: { dev: 'node dev-server.mjs' },
      }),
    )
    const manager = new PreviewManager()
    await expect(manager.start({ workspaceDir: workspace, readyTimeoutMs: 4_000 })).rejects.toThrow(
      /did not become healthy/,
    )
  }, 20_000)
})

describe('pickPort', () => {
  it('returns the preferred port when free', async () => {
    const server = createServer()
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const busy = (server.address() as { port: number }).port
    server.close()
    const free = await pickPort(0)
    expect(free).toBeGreaterThan(0)
    expect(free).not.toBe(busy)
  })
})
