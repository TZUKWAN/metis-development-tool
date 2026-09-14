/**
 * Shared test helpers: a local 127.0.0.1 http server (no external network
 * in tests — the url guard's localhostMode is exercised via allowLocal).
 */
import http from 'node:http'
import os from 'node:os'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { once } from 'node:events'
import type { AddressInfo } from 'node:net'

export interface TestServerRequest {
  method?: string
  url?: string
  headers?: http.IncomingHttpHeaders
  body: string
}

export interface TestServer {
  port: number
  url(path: string): string
  requests: TestServerRequest[]
  close(): Promise<void>
}

export async function startTestServer(
  handler: (req: http.IncomingMessage, res: http.ServerResponse, body: string) => void,
): Promise<TestServer> {
  const requests: TestServerRequest[] = []
  const server = http.createServer((req, res) => {
    res.on('error', () => {}) // aborted downloads (size-cap tests) must not crash the server
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end', () => {
      const body = Buffer.concat(chunks).toString('utf8')
      requests.push({ method: req.method, url: req.url, headers: req.headers, body })
      handler(req, res, body)
    })
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const { port } = server.address() as AddressInfo
  return {
    port,
    url: (pathname: string) => `http://127.0.0.1:${port}${pathname}`,
    requests,
    close: async () => {
      server.closeAllConnections()
      await server.close()
    },
  }
}

export async function makeTempDir(prefix: string): Promise<string> {
  return fsp.mkdtemp(path.join(os.tmpdir(), prefix))
}

export async function removeTempDir(dir: string): Promise<void> {
  await fsp.rm(dir, { recursive: true, force: true })
}
