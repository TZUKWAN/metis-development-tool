/**
 * web_fetch tests: url-guard unit cases (no network — sync / IP-literal
 * only) plus behavior against a LOCAL http server on 127.0.0.1 using the
 * explicit allowLocal opt-in.
 */
import { afterAll, describe, expect, it } from 'vitest'

import { createCapabilityContext } from '../src/context'
import { webFetchCapability } from '../src/capabilities/web-fetch'
import { assertUrlAllowed, assertUrlAllowedAsync, UrlBlockedError } from '../src/security/guards'
import { runCapabilityContractTests } from '../src/testing'
import { startTestServer, type TestServer } from './helpers'

const server: TestServer = await startTestServer((req, res) => {
  switch (req.url) {
    case '/html':
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      res.end(
        '<html><head><title>Hi &amp; welcome</title>' +
          '<style>body{color:red}</style><script>alert("evil")</script></head>' +
          '<body><h1>Hello</h1><p>World &copy; 2026</p><!-- comment --></body></html>',
      )
      break
    case '/json':
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end('{"answer":42}')
      break
    case '/binary':
      res.writeHead(200, { 'content-type': 'image/png' })
      res.end(Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]))
      break
    case '/big':
      res.writeHead(200, { 'content-type': 'text/plain' })
      res.end('x'.repeat(2 * 1024 * 1024))
      break
    case '/redirect-private':
      res.writeHead(302, { location: 'http://169.254.169.254/latest/meta-data/' })
      res.end()
      break
    case '/redirect-loop':
      res.writeHead(302, { location: '/redirect-loop' })
      res.end()
      break
    case '/redirect-relative':
      res.writeHead(302, { location: '/html' })
      res.end()
      break
    default:
      res.writeHead(200, { 'content-type': 'text/plain' })
      res.end('ok')
  }
})
afterAll(async () => {
  await server.close()
})

const happyInput: Record<string, unknown> = { url: server.url('/html'), allowLocal: true }

runCapabilityContractTests(webFetchCapability, { granted: ['network'] }, { happyInput, invalidInput: {} })

describe('url guard (sync, pre-DNS only — no network in tests)', () => {
  const blockedUrls = [
    'http://127.0.0.1/x',
    'http://169.254.169.254/latest/meta-data/',
    'http://10.0.0.1/x',
    'http://192.168.1.1/x',
    'http://[::1]/x',
    'http://metadata.google.internal/computeMetadata/v1/',
    'javascript:alert(1)',
    'file:///c:/windows/win.ini',
    'data:text/html,hi',
  ]
  for (const url of blockedUrls) {
    it(`blocks ${url}`, () => {
      expect(() => assertUrlAllowed(url)).toThrow(UrlBlockedError)
    })
  }

  it('allows public hostnames pre-DNS (DNS check happens in the async guard)', () => {
    expect(assertUrlAllowed('https://example.com/a?b=c').hostname).toBe('example.com')
  })

  it('localhostMode is an explicit opt-in for loopback literals only', () => {
    expect(() => assertUrlAllowed('http://127.0.0.1/x', { localhostMode: true })).not.toThrow()
    expect(() => assertUrlAllowed('http://localhost:3000/x', { localhostMode: true })).not.toThrow()
    expect(() => assertUrlAllowed('http://169.254.169.254/', { localhostMode: true })).toThrow(UrlBlockedError)
  })

  it('async guard DNS-checks resolved addresses (IP literals skip DNS)', async () => {
    await expect(assertUrlAllowedAsync('http://127.0.0.1/')).rejects.toThrow(UrlBlockedError)
    await expect(assertUrlAllowedAsync('http://10.0.0.1/')).rejects.toThrow(UrlBlockedError)
    await expect(assertUrlAllowedAsync('http://127.0.0.1/', { localhostMode: true })).resolves.toBeInstanceOf(URL)
    await expect(assertUrlAllowedAsync('http://[::1]/', { localhostMode: true })).resolves.toBeInstanceOf(URL)
  })
})

describe('web_fetch behavior (local server via allowLocal)', () => {
  const ctx = createCapabilityContext({ granted: ['network'] })

  it('extracts title and readable text from html', async () => {
    const out = await webFetchCapability.execute(happyInput, ctx)
    expect(out.url).toBe(server.url('/html'))
    expect(out.status).toBe(200)
    expect(out.contentType).toContain('text/html')
    expect(out.title).toBe('Hi & welcome')
    const body = String(out.body)
    expect(body).toContain('Hello')
    expect(body).toContain('World © 2026')
    expect(body).not.toContain('alert')
    expect(body).not.toContain('evil')
    expect(body).not.toContain('color:red')
    expect(body).not.toContain('comment')
    expect(out.bytes).toBeGreaterThan(0)
  })

  it('raw=true returns the unmodified body', async () => {
    const out = await webFetchCapability.execute({ url: server.url('/html'), allowLocal: true, raw: true }, ctx)
    expect(String(out.body)).toContain('<script>alert("evil")</script>')
    expect(out.title).toBe('Hi & welcome')
  })

  it('passes json bodies through as text', async () => {
    const out = await webFetchCapability.execute({ url: server.url('/json'), allowLocal: true }, ctx)
    expect(String(out.body)).toBe('{"answer":42}')
    expect(out.title).toBe('')
  })

  it('refuses binary content-types when raw=false', async () => {
    await expect(webFetchCapability.execute({ url: server.url('/binary'), allowLocal: true }, ctx)).rejects.toThrow(
      /content-type "image\/png" is not textual/,
    )
  })

  it('allows binary content-types when raw=true', async () => {
    const out = await webFetchCapability.execute({ url: server.url('/binary'), allowLocal: true, raw: true }, ctx)
    expect(out.bytes).toBe(8)
  })

  it('allowLocal=false rejects loopback targets with URL_BLOCKED', async () => {
    const err = await webFetchCapability.execute({ url: server.url('/html') }, ctx).then(
      () => null,
      (e: unknown) => e,
    )
    expect(err).toBeInstanceOf(UrlBlockedError)
    expect((err as UrlBlockedError).code).toBe('URL_BLOCKED')
  })

  it('aborts responses larger than maxBytes', async () => {
    await expect(
      webFetchCapability.execute({ url: server.url('/big'), allowLocal: true, maxBytes: 1000 }, ctx),
    ).rejects.toThrow(/response exceeds maxBytes \(limit 1000 bytes\)/)
  })

  it('blocks redirect hops to private addresses even with allowLocal', async () => {
    await expect(webFetchCapability.execute({ url: server.url('/redirect-private'), allowLocal: true }, ctx)).rejects.toThrow(
      UrlBlockedError,
    )
  })

  it('throws after too many redirects', async () => {
    await expect(webFetchCapability.execute({ url: server.url('/redirect-loop'), allowLocal: true }, ctx)).rejects.toThrow(
      /too many redirects \(limit 5\)/,
    )
  })

  it('follows safe redirects and reports the final url', async () => {
    const out = await webFetchCapability.execute({ url: server.url('/redirect-relative'), allowLocal: true }, ctx)
    expect(out.url).toBe(server.url('/html'))
    expect(out.title).toBe('Hi & welcome')
  })
})
