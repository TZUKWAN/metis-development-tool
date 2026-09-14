/**
 * browser capability tests against an injected FAKE driver: session
 * lifecycle, permission gating, scheme/SSRF blocking, screenshot output.
 */
import { afterAll, describe, expect, it } from 'vitest'

import { createCapabilityContext, type ContextOverrides } from '../src/context'
import {
  browserCapability,
  browserSessionCount,
  getBrowserSession,
  setBrowserDriverFactory,
  type BrowserDriver,
} from '../src/capabilities/browser'
import { UrlBlockedError } from '../src/security/guards'
import { runCapabilityContractTests } from '../src/testing'

interface FakeDriver extends BrowserDriver {
  calls: string[]
}

function makeFakeDriver(): FakeDriver {
  const calls: string[] = []
  return {
    calls,
    async open(url, opts) {
      calls.push(
        `open:${url}:${opts?.viewport ? `${opts.viewport.width}x${opts.viewport.height}` : '-'}`,
      )
    },
    async click(selector) {
      calls.push(`click:${selector}`)
    },
    async type(selector, text) {
      calls.push(`type:${selector}=${text}`)
    },
    async screenshot() {
      calls.push('screenshot')
      return new TextEncoder().encode('fake-png-bytes')
    },
    async close() {
      calls.push('close')
    },
  }
}

let lastDriver: FakeDriver | null = null
function installFakeDriver(): void {
  setBrowserDriverFactory(() => {
    lastDriver = makeFakeDriver()
    return lastDriver
  })
}

const overrides: ContextOverrides = { granted: ['browser', 'network'] }
const PUBLIC_URL = 'http://93.184.216.34/index.html' // IP literal → guard passes without DNS

// the contract harness runs before the other describes — it needs a driver
installFakeDriver()

afterAll(() => {
  setBrowserDriverFactory(null)
})

runCapabilityContractTests(browserCapability, overrides, {
  happyInput: { action: 'open', url: PUBLIC_URL, sessionId: 'contract' },
  invalidInput: { action: 'teleport' },
})

describe('browser permission gating', () => {
  it('denies the default context (browser is never default-granted)', async () => {
    const ctx = createCapabilityContext({})
    await expect(
      browserCapability.execute({ action: 'open', url: PUBLIC_URL }, ctx),
    ).rejects.toThrow(/requires browser permission/)
  })
})

describe('browser driver injection', () => {
  it('throws a clear error when no driver factory is registered', async () => {
    setBrowserDriverFactory(null)
    const ctx = createCapabilityContext(overrides)
    await expect(
      browserCapability.execute({ action: 'open', url: PUBLIC_URL }, ctx),
    ).rejects.toThrow(
      'browser capability requires a browser driver — the generated app registers one (Playwright-backed)',
    )
  })
})

describe('browser session lifecycle (fake driver)', () => {
  const ctx = createCapabilityContext(overrides)

  it('auto-opens on first use and runs the full flow', async () => {
    installFakeDriver()
    const opened = await browserCapability.execute(
      { action: 'open', url: PUBLIC_URL, sessionId: 's1', viewport: { width: 800, height: 600 } },
      ctx,
    )
    expect(opened.sessionId).toBe('s1')
    expect(opened.url).toBe(PUBLIC_URL)
    expect(getBrowserSession('s1')).toBeDefined()
    expect(browserSessionCount()).toBeGreaterThan(0)

    await browserCapability.execute(
      { action: 'navigate', url: `${PUBLIC_URL}?page=2`, sessionId: 's1' },
      ctx,
    )
    await browserCapability.execute({ action: 'click', selector: '#next', sessionId: 's1' }, ctx)
    await browserCapability.execute(
      { action: 'type', selector: 'input.q', text: 'hello', sessionId: 's1' },
      ctx,
    )

    const shot = await browserCapability.execute({ action: 'screenshot', sessionId: 's1' }, ctx)
    expect(String(shot.dataUrl)).toMatch(/^image\/png;base64,/)

    const closed = await browserCapability.execute({ action: 'close', sessionId: 's1' }, ctx)
    expect(closed.sessionId).toBe('s1')
    expect(getBrowserSession('s1')).toBeUndefined()

    expect(lastDriver?.calls).toEqual([
      `open:${PUBLIC_URL}:800x600`,
      `open:${PUBLIC_URL}?page=2:-`,
      'click:#next',
      'type:input.q=hello',
      'screenshot',
      'close',
    ])
  })

  it('requires an open session for click/type/screenshot/close', async () => {
    installFakeDriver()
    await expect(
      browserCapability.execute({ action: 'click', selector: '#x', sessionId: 'ghost' }, ctx),
    ).rejects.toThrow(/no open session "ghost"/)
    await expect(
      browserCapability.execute(
        { action: 'type', selector: '#x', text: 'y', sessionId: 'ghost' },
        ctx,
      ),
    ).rejects.toThrow(/no open session "ghost"/)
    await expect(
      browserCapability.execute({ action: 'screenshot', sessionId: 'ghost' }, ctx),
    ).rejects.toThrow(/no open session "ghost"/)
    await expect(
      browserCapability.execute({ action: 'close', sessionId: 'ghost' }, ctx),
    ).rejects.toThrow(/no open session "ghost" to close/)
  })

  it('requires a selector for click/type', async () => {
    installFakeDriver()
    await browserCapability.execute({ action: 'open', url: PUBLIC_URL, sessionId: 's2' }, ctx)
    await expect(
      browserCapability.execute({ action: 'click', sessionId: 's2' }, ctx),
    ).rejects.toThrow(/selector/)
    await expect(
      browserCapability.execute({ action: 'type', sessionId: 's2', text: 'x' }, ctx),
    ).rejects.toThrow(/selector/)
    await expect(
      browserCapability.execute({ action: 'type', selector: '#x', sessionId: 's2' }, ctx),
    ).rejects.toThrow(/"type" requires the "text"/)
  })

  it('validates the viewport', async () => {
    installFakeDriver()
    await expect(
      browserCapability.execute(
        { action: 'open', url: PUBLIC_URL, sessionId: 's3', viewport: { width: -1, height: 0 } },
        ctx,
      ),
    ).rejects.toThrow(/viewport/)
  })
})

describe('browser url guard', () => {
  const ctx = createCapabilityContext(overrides)

  it('blocks non-http(s) schemes BEFORE any driver call — no opt-out', async () => {
    installFakeDriver()
    const callsBefore = lastDriver?.calls.length ?? 0
    for (const url of ['javascript:alert(1)', 'file:///c:/x.html', 'data:text/html,<b>x</b>']) {
      await expect(
        browserCapability.execute({ action: 'open', url, sessionId: 'guard' }, ctx),
      ).rejects.toThrow(/scheme ".*" is blocked/)
    }
    expect(lastDriver?.calls.length).toBe(callsBefore) // the driver was never invoked
  })

  it('blocks SSRF targets via the async guard', async () => {
    installFakeDriver()
    // IP literals skip DNS → deterministic, no network in tests
    await expect(
      browserCapability.execute(
        { action: 'open', url: 'http://169.254.169.254/', sessionId: 'guard' },
        ctx,
      ),
    ).rejects.toThrow(UrlBlockedError)
    await expect(
      browserCapability.execute(
        { action: 'navigate', url: 'http://10.0.0.1/x', sessionId: 'guard' },
        ctx,
      ),
    ).rejects.toThrow(UrlBlockedError)
  })

  it('requires a url for open/navigate', async () => {
    installFakeDriver()
    await expect(
      browserCapability.execute({ action: 'open', sessionId: 'guard' }, ctx),
    ).rejects.toThrow(/non-empty "url"/)
    await expect(
      browserCapability.execute({ action: 'navigate', url: 'not a url', sessionId: 'guard' }, ctx),
    ).rejects.toThrow(/not a valid url/)
  })

  it('rejects unknown actions', async () => {
    await expect(browserCapability.execute({ action: 'teleport' }, ctx)).rejects.toThrow(
      /action must be one of/,
    )
  })
})
