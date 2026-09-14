/**
 * `browser` capability (tasklist P09.10): browser automation against an
 * INJECTED driver. This package has no playwright dependency — the
 * generated app registers a Playwright-backed factory at boot; MDT tests
 * inject a fake. URL actions are guarded with the shared SSRF guard and
 * non-http(s) schemes (javascript:, file:, data:) are always blocked
 * before any driver call.
 */
import { requirePermission } from '../context'
import type { Capability, CapabilityContext } from '../manifest'
import { assertUrlAllowedAsync } from '../security/guards'

export interface BrowserDriverOpenOptions {
  signal?: AbortSignal
  viewport?: { width: number; height: number }
}

export interface BrowserDriver {
  open(url: string, opts: BrowserDriverOpenOptions): Promise<void>
  click(selector: string): Promise<void>
  type(selector: string, text: string): Promise<void>
  screenshot(): Promise<Uint8Array>
  close(): Promise<void>
}

const NO_DRIVER_MESSAGE = 'browser capability requires a browser driver — the generated app registers one (Playwright-backed)'

let driverFactory: (() => BrowserDriver) | null = null
const sessions = new Map<string, BrowserDriver>()

/** Register (or clear with null) the factory used to create browser sessions. */
export function setBrowserDriverFactory(factory: (() => BrowserDriver) | null): void {
  driverFactory = factory
}

export function getBrowserSession(id: string): BrowserDriver | undefined {
  return sessions.get(id)
}

/** Test helper: number of live sessions. */
export function browserSessionCount(): number {
  return sessions.size
}

const BROWSER_ACTIONS = ['open', 'navigate', 'click', 'type', 'screenshot', 'close'] as const

export const browserCapability: Capability = {
  manifest: {
    id: 'browser',
    name: 'Browser',
    version: '1.0.0',
    category: 'browser',
    description: 'Drive a real browser (open, navigate, click, type, screenshot, close) through an injected driver.',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: [...BROWSER_ACTIONS], description: 'browser action' },
        sessionId: { type: 'string', description: 'session key; defaults to "default"' },
        url: { type: 'string', description: 'http(s) url for open/navigate' },
        selector: { type: 'string', description: 'css selector for click/type' },
        text: { type: 'string', description: 'text to type for the type action' },
        viewport: {
          type: 'object',
          description: '{ width, height } passed to the driver on first open',
          properties: { width: { type: 'number' }, height: { type: 'number' } },
          required: ['width', 'height'],
        },
      },
      required: ['action'],
      additionalProperties: false,
    },
    outputSchema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string' },
        url: { type: 'string', description: 'url after open/navigate, else empty' },
        dataUrl: { type: 'string', description: 'screenshot png data url' },
      },
      required: ['sessionId'],
      additionalProperties: false,
    },
    permissions: [
      { scope: 'browser', detail: 'drive an automated browser session', required: true, defaultGranted: false },
      { scope: 'network', detail: 'page navigation fetches', required: false, defaultGranted: false },
    ],
    secrets: [],
    ui: {
      icon: '🖥️',
      accent: '#5b8def',
      summary: 'Automate a browser: navigate, click, type, screenshot',
      keywords: ['browser', 'playwright', 'screenshot', 'automation'],
      doc: 'browser',
    },
    timeoutMs: 60_000,
    maxOutputBytes: 1_000_000,
  },
  async execute(input: Record<string, unknown>, ctx: CapabilityContext): Promise<Record<string, unknown>> {
    requirePermission(ctx, browserCapability, 'browser')
    const action = String(input.action)
    if (!(BROWSER_ACTIONS as readonly string[]).includes(action)) {
      throw new Error(`browser: action must be one of ${BROWSER_ACTIONS.join('/')} — got "${action}"`)
    }
    const sessionId = typeof input.sessionId === 'string' && input.sessionId !== '' ? input.sessionId : 'default'
    ctx.log(`browser action=${action} session=${sessionId}`)

    if (action === 'open' || action === 'navigate') {
      const url = await guardBrowserUrl(input.url)
      const viewport = normalizeViewport(input.viewport)
      const driver = ensureSession(sessionId)
      await driver.open(url, { signal: ctx.signal, viewport })
      return { sessionId, url }
    }
    if (action === 'click' || action === 'type') {
      const driver = requireSession(sessionId, action)
      const selector = typeof input.selector === 'string' && input.selector !== '' ? input.selector : null
      if (!selector) throw new Error(`browser: "${action}" requires a non-empty "selector"`)
      if (action === 'click') {
        await driver.click(selector)
      } else {
        const text = typeof input.text === 'string' ? input.text : null
        if (text === null) throw new Error('browser: "type" requires the "text" to type')
        await driver.type(selector, text)
      }
      return { sessionId, url: '' }
    }
    if (action === 'screenshot') {
      const driver = requireSession(sessionId, action)
      const png = await driver.screenshot()
      const dataUrl = `image/png;base64,${Buffer.from(png).toString('base64')}`
      if (Buffer.byteLength(dataUrl) > browserCapability.manifest.maxOutputBytes) {
        throw new Error(
          `browser: screenshot exceeds maxOutputBytes (${browserCapability.manifest.maxOutputBytes} bytes) — capture a smaller viewport`,
        )
      }
      return { sessionId, url: '', dataUrl }
    }
    // action === 'close'
    const driver = sessions.get(sessionId)
    if (!driver) throw new Error(`browser: no open session "${sessionId}" to close`)
    sessions.delete(sessionId)
    await driver.close()
    return { sessionId, url: '' }
  },
}

/**
 * Validate a browser target url: protocol check BEFORE any driver call
 * (javascript:/file:/data: are always blocked, no opt-out), then the full
 * SSRF guard.
 */
async function guardBrowserUrl(value: unknown): Promise<string> {
  const url = typeof value === 'string' && value.trim() !== '' ? value.trim() : null
  if (!url) throw new Error('browser: "open"/"navigate" require a non-empty "url"')
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new Error(`browser: "${url}" is not a valid url`)
  }
  // protocol check happens BEFORE any driver call — no opt-out for javascript:/file:/data:
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`browser: url scheme "${parsed.protocol}" is blocked — only http/https pages can be opened`)
  }
  // then the full SSRF guard (DNS resolution + per-address class checks)
  // note: no loopback opt-in on the browser capability in 1.0
  const allowed = await assertUrlAllowedAsync(parsed.href)
  return allowed.href
}

function normalizeViewport(value: unknown): BrowserDriverOpenOptions['viewport'] {
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'object' || Array.isArray(value)) throw new Error('browser: "viewport" must be an object { width, height }')
  const record = value as Record<string, unknown>
  const width = Number(record.width)
  const height = Number(record.height)
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new Error('browser: "viewport" needs positive integer width and height')
  }
  return { width, height }
}

function ensureSession(sessionId: string): BrowserDriver {
  const existing = sessions.get(sessionId)
  if (existing) return existing
  if (!driverFactory) throw new Error(NO_DRIVER_MESSAGE)
  const driver = driverFactory()
  sessions.set(sessionId, driver)
  return driver
}

function requireSession(sessionId: string, action: string): BrowserDriver {
  const driver = sessions.get(sessionId)
  if (!driver) throw new Error(`browser: no open session "${sessionId}" — run the "open" action first before "${action}"`)
  return driver
}
