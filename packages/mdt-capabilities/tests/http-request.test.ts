/**
 * http_request tests: methods, query/headers/body handling, secret-header
 * interpolation, redirect limits — all against a LOCAL server.
 */
import { afterAll, describe, expect, it } from 'vitest'

import { createCapabilityContext } from '../src/context'
import { httpRequestCapability } from '../src/capabilities/http-request'
import { UrlBlockedError } from '../src/security/guards'
import { runCapabilityContractTests } from '../src/testing'
import { startTestServer, type TestServer } from './helpers'

const server: TestServer = await startTestServer((req, res, body) => {
  const path = (req.url ?? '').split('?')[0]
  switch (path) {
    case '/echo': {
      // echoes method/url/body as json (never echoes request headers — secrets must not bounce back)
      res.writeHead(200, { 'content-type': 'application/json', 'x-custom': 'yes' })
      res.end(JSON.stringify({ method: req.method, url: req.url, body }))
      break
    }
    case '/text':
      res.writeHead(200, { 'content-type': 'text/plain' })
      res.end('plain text')
      break
    case '/head-target':
      res.writeHead(200, { 'content-type': 'text/plain' })
      res.end('body ignored for head')
      break
    case '/big':
      res.writeHead(200, { 'content-type': 'text/plain' })
      res.end('x'.repeat(2 * 1024 * 1024))
      break
    case '/redirect-private':
      res.writeHead(302, { location: 'http://169.254.169.254/latest/meta-data/' })
      res.end()
      break
    default: {
      const hop = /^\/hop(\d+)$/.exec(path)
      if (hop) {
        const n = Number(hop[1])
        res.writeHead(302, { location: n >= 4 ? '/echo' : `/hop${n + 1}` })
        res.end()
      } else {
        res.writeHead(404, { 'content-type': 'text/plain' })
        res.end('not found')
      }
    }
  }
})
afterAll(async () => {
  await server.close()
})

runCapabilityContractTests(
  httpRequestCapability,
  { granted: ['network'] },
  {
    happyInput: { url: server.url('/echo'), allowLocal: true },
    invalidInput: { url: 'http://x.y', method: 'trace' },
  },
)

describe('http_request behavior (local server via allowLocal)', () => {
  const ctx = createCapabilityContext({
    granted: ['network'],
    secrets: { api_token: 'tok-live-8127' },
  })

  it('GET with query record hits the server and parses the json response', async () => {
    const out = await httpRequestCapability.execute(
      { url: server.url('/echo'), query: { a: '1', b: 'x y' }, allowLocal: true },
      ctx,
    )
    expect(out.status).toBe(200)
    expect(out.statusText).toBe('OK')
    const headers = out.headers as Record<string, string>
    expect(headers['content-type']).toContain('application/json')
    expect(headers['x-custom']).toBe('yes')
    const parsed = out.json as { method: string; url: string; body: string }
    expect(parsed.method).toBe('GET')
    expect(parsed.url).toBe('/echo?a=1&b=x+y')
    expect(parsed.body).toBe('')
  })

  it('POST with a json body serializes and sets the content-type', async () => {
    const out = await httpRequestCapability.execute(
      { url: server.url('/echo'), method: 'post', json: { hello: 'world' }, allowLocal: true },
      ctx,
    )
    const parsed = out.json as { method: string; body: string }
    expect(parsed.method).toBe('POST')
    expect(parsed.body).toBe('{"hello":"world"}')
    const headers = out.headers as Record<string, string>
    // the response carries our request content-type? no — assert via the echoed server request instead
    expect(headers['x-custom']).toBe('yes')
    const sent = server.requests.at(-1)
    expect(sent?.headers?.['content-type']).toBe('application/json')
  })

  it('sends raw string bodies and custom headers', async () => {
    await httpRequestCapability.execute(
      {
        url: server.url('/echo'),
        method: 'put',
        body: 'raw-body',
        headers: { 'x-trace': 'trace-1' },
        allowLocal: true,
      },
      ctx,
    )
    const sent = server.requests.at(-1)
    expect(sent?.method).toBe('PUT')
    expect(sent?.body).toBe('raw-body')
    expect(sent?.headers?.['x-trace']).toBe('trace-1')
  })

  it('resolves ${secret:NAME} header values from ctx.secrets', async () => {
    const out = await httpRequestCapability.execute(
      {
        url: server.url('/text'),
        headers: { authorization: '${secret:api_token}' },
        allowLocal: true,
      },
      ctx,
    )
    expect(out.body).toBe('plain text')
    expect(server.requests.at(-1)?.headers?.authorization).toBe('tok-live-8127')
    // the secret must never appear in the capability output
    expect(JSON.stringify(out)).not.toContain('tok-live-8127')
  })

  it('throws a clear error when a referenced secret is missing', async () => {
    await expect(
      httpRequestCapability.execute(
        {
          url: server.url('/text'),
          headers: { authorization: '${secret:nope}' },
          allowLocal: true,
        },
        ctx,
      ),
    ).rejects.toThrow(/secret "nope".*not configured/)
  })

  it('HEAD returns no body', async () => {
    const out = await httpRequestCapability.execute(
      { url: server.url('/head-target'), method: 'head', allowLocal: true },
      ctx,
    )
    expect(out.status).toBe(200)
    expect(out.body).toBe('')
    expect('json' in out).toBe(false)
  })

  it('follows up to 3 redirects and re-validates every hop', async () => {
    // /hop2 -> /hop3 -> /hop4 -> /echo is exactly 3 redirects
    const out = await httpRequestCapability.execute(
      { url: server.url('/hop2'), allowLocal: true },
      ctx,
    )
    expect(out.status).toBe(200)
    const sent = server.requests.at(-1)
    expect(sent?.url).toBe('/echo')
  })

  it('rejects a 4-hop chain (limit 3)', async () => {
    // /hop1 -> /hop2 -> /hop3 -> /hop4 -> /echo needs 4 redirects
    await expect(
      httpRequestCapability.execute({ url: server.url('/hop1'), allowLocal: true }, ctx),
    ).rejects.toThrow(/too many redirects \(limit 3\)/)
  })

  it('blocks redirect hops to private addresses', async () => {
    await expect(
      httpRequestCapability.execute(
        { url: server.url('/redirect-private'), allowLocal: true },
        ctx,
      ),
    ).rejects.toThrow(UrlBlockedError)
  })

  it('allowLocal=false rejects loopback targets with URL_BLOCKED', async () => {
    const err = await httpRequestCapability.execute({ url: server.url('/text') }, ctx).then(
      () => null,
      (e: unknown) => e,
    )
    expect(err).toBeInstanceOf(UrlBlockedError)
    expect((err as UrlBlockedError).code).toBe('URL_BLOCKED')
  })

  it('rejects methods outside the enum', async () => {
    await expect(
      httpRequestCapability.execute(
        { url: server.url('/text'), method: 'connect', allowLocal: true },
        ctx,
      ),
    ).rejects.toThrow(/method must be one of/)
  })

  it('rejects body and json together', async () => {
    await expect(
      httpRequestCapability.execute(
        { url: server.url('/text'), body: 'a', json: { b: 1 }, allowLocal: true },
        ctx,
      ),
    ).rejects.toThrow(/either "body" or "json"/)
  })

  it('aborts responses larger than maxBytes', async () => {
    await expect(
      httpRequestCapability.execute(
        { url: server.url('/big'), allowLocal: true, maxBytes: 500 },
        ctx,
      ),
    ).rejects.toThrow(/response exceeds maxBytes \(limit 500 bytes\)/)
  })
})
