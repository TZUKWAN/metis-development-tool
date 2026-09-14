/**
 * `web_fetch` capability (tasklist P09.08): safe http(s) GET with SSRF
 * guards, per-hop redirect re-validation, response size caps and
 * dependency-free HTML text extraction (regex-based is acceptable for 1.0;
 * never innerHTML/eval).
 *
 * Also hosts the shared `guardedFetch` plumbing used by web_search and
 * http_request so the SSRF/timeout/size discipline lives in exactly one
 * place.
 */
import { Readable } from 'node:stream'

import { redact, requirePermission } from '../context'
import type { Capability, CapabilityContext } from '../manifest'
import { assertUrlAllowedAsync, UrlBlockedError } from '../security/guards'

const DEFAULT_MAX_BYTES = 1_000_000
const DEFAULT_TIMEOUT_MS = 20_000
const MAX_REDIRECTS = 5

export const webFetchCapability: Capability = {
  manifest: {
    id: 'web_fetch',
    name: 'Web Fetch',
    version: '1.0.0',
    category: 'web',
    description:
      'Fetch an http(s) URL and return readable text (title + tag-stripped body) or the raw body, with SSRF guards, redirect re-validation and hard size limits.',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'absolute http(s) url to fetch' },
        maxBytes: { type: 'number', description: 'response size cap in bytes (default 1000000)' },
        timeoutMs: { type: 'number', description: 'per-request timeout in ms (default 20000)' },
        raw: {
          type: 'boolean',
          description: 'return the raw body instead of text-extracted (default false)',
        },
        allowLocal: {
          type: 'boolean',
          description: 'explicit loopback opt-in for local dev/tests (default false)',
        },
      },
      required: ['url'],
      additionalProperties: false,
    },
    outputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'final url after redirects' },
        status: { type: 'number' },
        contentType: { type: 'string' },
        body: { type: 'string', description: 'extracted text or raw body' },
        bytes: { type: 'number', description: 'downloaded body bytes' },
        title: { type: 'string', description: '<title> when the content is html, else empty' },
      },
      required: ['url', 'status', 'contentType', 'body', 'bytes', 'title'],
      additionalProperties: false,
    },
    permissions: [
      { scope: 'network', detail: 'http(s) GET fetch', required: true, defaultGranted: true },
    ],
    secrets: [],
    ui: {
      icon: '🌐',
      accent: '#5b8def',
      summary: 'Fetch a web page as readable text',
      keywords: ['fetch', 'http', 'url', 'web', 'scrape'],
      doc: 'web-fetch',
    },
    timeoutMs: 30_000,
    maxOutputBytes: 1_000_000,
  },
  async execute(
    input: Record<string, unknown>,
    ctx: CapabilityContext,
  ): Promise<Record<string, unknown>> {
    requirePermission(ctx, webFetchCapability, 'network')
    if (ctx.signal.aborted) throw new Error('web_fetch cancelled')

    const url = requireNonEmptyString(
      input.url,
      'web_fetch: "url" is required and must be a non-empty string',
    )
    const maxBytes = positiveInt(
      input.maxBytes,
      DEFAULT_MAX_BYTES,
      'web_fetch: maxBytes must be a positive integer',
    )
    const timeoutMs = positiveInt(
      input.timeoutMs,
      DEFAULT_TIMEOUT_MS,
      'web_fetch: timeoutMs must be a positive integer',
    )
    const raw = input.raw === true
    const allowLocal = input.allowLocal === true

    const result = await guardedFetch({
      url,
      label: 'web_fetch',
      timeoutMs,
      maxBytes,
      allowLocal,
      maxRedirects: MAX_REDIRECTS,
      signal: ctx.signal,
    })

    const contentType = result.contentType
    if (!raw && !isTextualContentType(contentType)) {
      throw new Error(
        `web_fetch: content-type "${contentType || 'unknown'}" is not textual — pass raw: true to retrieve the body anyway`,
      )
    }
    const text = new TextDecoder('utf-8', { fatal: false }).decode(result.bodyBytes)
    const isHtml = isHtmlContentType(contentType)
    const title = isHtml ? extractHtmlTitle(text) : ''
    const body = !raw && isHtml ? extractHtmlText(text) : text
    ctx.log(
      `web_fetch ${redact(url)} -> ${redact(result.finalUrl)} status=${result.status} bytes=${result.bytes}`,
    )
    return {
      url: result.finalUrl,
      status: result.status,
      contentType,
      body,
      bytes: result.bytes,
      title,
    }
  },
}

// ---------------------------------------------------------------------------
// shared guarded fetch plumbing (used by web_fetch / web_search / http_request)
// ---------------------------------------------------------------------------

export interface GuardedFetchInput {
  /** absolute url to fetch */
  url: string
  /** prefix for error messages, e.g. 'web_fetch' */
  label: string
  method?: string
  headers?: Record<string, string>
  body?: string
  timeoutMs?: number
  maxBytes?: number
  /** explicit loopback opt-in (maps to the url guard's localhostMode) */
  allowLocal?: boolean
  maxRedirects?: number
  /** skip reading the body (HEAD requests) */
  skipBody?: boolean
  signal: AbortSignal
}

export interface GuardedFetchResult {
  finalUrl: string
  status: number
  statusText: string
  /** response headers, lowercase keys, duplicate values joined with ', ' */
  headers: Record<string, string>
  contentType: string
  bodyBytes: Uint8Array
  bytes: number
}

interface AbortLink {
  readonly state: { timedOut: boolean; cancelled: boolean }
  readonly timeoutMs: number
  /** map a fetch/stream error onto a structured timeout/cancel error */
  mapError(err: unknown): Error
  dispose(): void
}

/** Link a ctx signal + a timeout to one controller; aborts unblock the whole pipeline. */
function linkAbort(
  signal: AbortSignal,
  timeoutMs: number,
  controller: AbortController,
  label: string,
): AbortLink {
  const state = { timedOut: false, cancelled: false }
  const onAbort = () => {
    state.cancelled = true
    controller.abort()
  }
  if (signal.aborted) {
    state.cancelled = true
    controller.abort()
  } else {
    signal.addEventListener('abort', onAbort, { once: true })
  }
  const timer = setTimeout(() => {
    state.timedOut = true
    controller.abort()
  }, timeoutMs)
  return {
    state,
    timeoutMs,
    mapError(err) {
      if (state.timedOut) return new Error(`${label} timed out after ${timeoutMs}ms`)
      if (state.cancelled) return new Error(`${label} cancelled`)
      const message = err instanceof Error ? err.message : String(err)
      return new Error(`${label} failed: ${message}`)
    },
    dispose() {
      clearTimeout(timer)
      signal.removeEventListener('abort', onAbort)
      // release sockets even after a fully-consumed response
      controller.abort()
    },
  }
}

/**
 * fetch with the full guard discipline: url guard (pre-DNS + resolved
 * addresses), manual redirects re-validated on EVERY hop, timeout linked to
 * the ctx signal, and body reading capped at maxBytes (throws when exceeded).
 */
export async function guardedFetch(input: GuardedFetchInput): Promise<GuardedFetchResult> {
  const label = input.label
  const timeoutMs = positiveInt(
    input.timeoutMs,
    DEFAULT_TIMEOUT_MS,
    `${label}: timeoutMs must be a positive integer`,
  )
  const maxBytes = positiveInt(
    input.maxBytes,
    DEFAULT_MAX_BYTES,
    `${label}: maxBytes must be a positive integer`,
  )
  const maxRedirects = positiveInt(
    input.maxRedirects ?? MAX_REDIRECTS,
    MAX_REDIRECTS,
    `${label}: invalid maxRedirects`,
  )
  const guardOptions = { localhostMode: input.allowLocal === true }

  if (input.signal.aborted) throw new Error(`${label} cancelled`)
  let current = await assertUrlAllowedAsync(input.url, guardOptions)
  const controller = new AbortController()
  const abort = linkAbort(input.signal, timeoutMs, controller, label)
  try {
    let hops = 0
    for (;;) {
      let response: Response
      try {
        response = await fetch(current.href, {
          method: input.method ?? 'GET',
          headers: input.headers,
          body: input.body,
          redirect: 'manual',
          signal: controller.signal,
        })
      } catch (err) {
        throw abort.mapError(err)
      }
      if (isRedirectStatus(response.status)) {
        const location = response.headers.get('location')
        void response.body?.cancel().catch(() => {})
        if (!location)
          throw new Error(`${label}: redirect ${response.status} carries no location header`)
        hops += 1
        if (hops > maxRedirects)
          throw new Error(`${label}: too many redirects (limit ${maxRedirects})`)
        let next: URL
        try {
          next = new URL(location, current)
        } catch {
          throw new UrlBlockedError(`${label}: redirect location "${location}" is not a valid url`)
        }
        current = await assertUrlAllowedAsync(next.href, guardOptions)
        continue
      }
      const headers = lowercaseHeaders(response.headers)
      if (input.skipBody === true) {
        return {
          finalUrl: current.href,
          status: response.status,
          statusText: response.statusText,
          headers,
          contentType: headers['content-type'] ?? '',
          bodyBytes: new Uint8Array(0),
          bytes: 0,
        }
      }
      const body = await readBodyCapped(response, maxBytes, controller, label, abort)
      return {
        finalUrl: current.href,
        status: response.status,
        statusText: response.statusText,
        headers,
        contentType: headers['content-type'] ?? '',
        bodyBytes: body,
        bytes: body.byteLength,
      }
    }
  } finally {
    abort.dispose()
  }
}

function isRedirectStatus(status: number): boolean {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308
}

async function readBodyCapped(
  response: Response,
  maxBytes: number,
  controller: AbortController,
  label: string,
  abort: AbortLink,
): Promise<Buffer> {
  if (!response.body) return Buffer.alloc(0)
  const stream = Readable.fromWeb(
    response.body as unknown as import('node:stream/web').ReadableStream<Uint8Array>,
  )
  const chunks: Buffer[] = []
  let total = 0
  try {
    for await (const chunk of stream) {
      const buf = Buffer.from(chunk as Uint8Array)
      total += buf.byteLength
      if (total > maxBytes) {
        controller.abort()
        throw new Error(`${label}: response exceeds maxBytes (limit ${maxBytes} bytes)`)
      }
      chunks.push(buf)
    }
  } catch (err) {
    throw abort.mapError(err)
  }
  return Buffer.concat(chunks)
}

function lowercaseHeaders(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [key, value] of headers.entries()) {
    out[key.toLowerCase()] =
      key.toLowerCase() in out ? `${out[key.toLowerCase()]}, ${value}` : value
  }
  return out
}

/** Text types safe to extract (no binary decoding surprises): text/*, json, xml. */
export function isTextualContentType(contentType: string): boolean {
  const mime = contentType.split(';')[0].trim().toLowerCase()
  if (mime === '') return false
  if (mime.startsWith('text/')) return true
  if (mime === 'application/json' || mime === 'application/xhtml+xml' || mime === 'application/xml')
    return true
  if (mime.endsWith('+json') || mime.endsWith('+xml')) return true
  return false
}

function isHtmlContentType(contentType: string): boolean {
  const mime = contentType.split(';')[0].trim().toLowerCase()
  return mime === 'text/html' || mime === 'application/xhtml+xml'
}

// ---------------------------------------------------------------------------
// regex-based html helpers (no external deps; never innerHTML/eval)
// ---------------------------------------------------------------------------

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  copy: '©',
  reg: '®',
  trade: '™',
  hellip: '…',
  mdash: '—',
  ndash: '–',
  laquo: '«',
  raquo: '»',
}

/** Decode the common html entities (&amp;, &#39;, &#x27;, …). */
export function decodeHtmlEntities(text: string): string {
  return text.replace(/&(#[xX]?[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/g, (match, body: string) => {
    if (body.startsWith('#')) {
      const code =
        body[1] === 'x' || body[1] === 'X'
          ? Number.parseInt(body.slice(2), 16)
          : Number.parseInt(body.slice(1), 10)
      if (!Number.isInteger(code) || code < 0 || code > 0x10ffff) return match
      try {
        return String.fromCodePoint(code)
      } catch {
        return match
      }
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? match
  })
}

/** Extract and decode `<title>` (empty string when absent). */
export function extractHtmlTitle(html: string): string {
  const match = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)
  if (!match) return ''
  return decodeHtmlEntities(match[1].replace(/\s+/g, ' ').trim())
}

/** Strip scripts/styles/comments/tags and decode entities into readable text. */
export function extractHtmlText(html: string): string {
  let out = html
  out = out.replace(/<!--[\s\S]*?-->/g, ' ')
  out = out.replace(/<(script|style|noscript|template|svg|head)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
  out = out.replace(/<br\s*\/?>/gi, '\n')
  out = out.replace(
    /<\/(?:p|div|section|article|header|footer|h[1-6]|li|tr|table|ul|ol|blockquote|pre|title)>/gi,
    '\n',
  )
  out = out.replace(/<[^>]+>/g, ' ')
  out = decodeHtmlEntities(out)
  out = out.replace(/[ \t\r\f]+/g, ' ')
  out = out.replace(/ ?\n ?/g, '\n')
  out = out.replace(/\n{3,}/g, '\n\n')
  return out.trim()
}

// ---------------------------------------------------------------------------
// small shared input helpers
// ---------------------------------------------------------------------------

export function requireNonEmptyString(value: unknown, message: string): string {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(message)
  return value.trim()
}

export function positiveInt(value: unknown, fallback: number, message: string): number {
  if (value === undefined || value === null) return fallback
  const n = Number(value)
  if (!Number.isInteger(n) || n <= 0) throw new Error(message)
  return n
}

/** Coerce an unknown input into a plain string→string record. */
export function asStringRecord(value: unknown, label: string): Record<string, string> {
  if (value === undefined || value === null) return {}
  if (typeof value !== 'object' || Array.isArray(value))
    throw new Error(`${label} must be an object of string values`)
  const out: Record<string, string> = {}
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    out[key] = String(entry)
  }
  return out
}
