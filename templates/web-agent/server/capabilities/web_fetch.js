/**
 * Generated capability module — "web_fetch" (generator-owned).
 * Self-contained by construction (P11.21): plain JavaScript, zero npm
 * dependencies, no @mdt/* imports. The manifest below is the registry
 * manifest at generation time; `execute(input, ctx)` follows the MDT
 * capability contract (throws on failure, honors ctx.signal, never
 * returns raw secrets).
 */
export const manifest = {
  "category": "web",
  "description": "Fetch an http(s) URL and return readable text (title + tag-stripped body) or the raw body, with SSRF guards, redirect re-validation and hard size limits.",
  "id": "web_fetch",
  "inputSchema": {
    "additionalProperties": false,
    "properties": {
      "allowLocal": {
        "description": "explicit loopback opt-in for local dev/tests (default false)",
        "type": "boolean"
      },
      "maxBytes": {
        "description": "response size cap in bytes (default 1000000)",
        "type": "number"
      },
      "raw": {
        "description": "return the raw body instead of text-extracted (default false)",
        "type": "boolean"
      },
      "timeoutMs": {
        "description": "per-request timeout in ms (default 20000)",
        "type": "number"
      },
      "url": {
        "description": "absolute http(s) url to fetch",
        "type": "string"
      }
    },
    "required": [
      "url"
    ],
    "type": "object"
  },
  "maxOutputBytes": 1000000,
  "name": "Web Fetch",
  "outputSchema": {
    "additionalProperties": false,
    "properties": {
      "body": {
        "description": "extracted text or raw body",
        "type": "string"
      },
      "bytes": {
        "description": "downloaded body bytes",
        "type": "number"
      },
      "contentType": {
        "type": "string"
      },
      "status": {
        "type": "number"
      },
      "title": {
        "description": "<title> when the content is html, else empty",
        "type": "string"
      },
      "url": {
        "description": "final url after redirects",
        "type": "string"
      }
    },
    "required": [
      "url",
      "status",
      "contentType",
      "body",
      "bytes",
      "title"
    ],
    "type": "object"
  },
  "permissions": [
    {
      "defaultGranted": true,
      "detail": "http(s) GET fetch",
      "required": true,
      "scope": "network"
    }
  ],
  "secrets": [],
  "timeoutMs": 30000,
  "ui": {
    "accent": "#5b8def",
    "doc": "web-fetch",
    "icon": "🌐",
    "keywords": [
      "fetch",
      "http",
      "url",
      "web",
      "scrape"
    ],
    "summary": "Fetch a web page as readable text"
  },
  "version": "1.0.0"
}

/**
 * Self-contained `web_fetch` capability for generated apps (generator-owned
 * runtime source; emitted verbatim into server/capabilities/web_fetch.js).
 * Plain JS, zero npm dependencies. Port of @mdt/capabilities web-fetch.ts +
 * security guards: SSRF defense (scheme allowlist, hostname blocklist, DNS
 * resolution class checks), per-hop redirect re-validation, timeout linked
 * to the ctx signal, hard body size caps, regex HTML text extraction
 * (never innerHTML/eval).
 */
import { promises as dnsPromises } from 'node:dns'
import { isIP } from 'node:net'
import { Readable } from 'node:stream'

const DEFAULT_MAX_BYTES = 1_000_000
const DEFAULT_TIMEOUT_MS = 20_000
const MAX_REDIRECTS = 5

// ---------------------------------------------------------------------------
// URL guard (SSRF defense)
// ---------------------------------------------------------------------------

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'metadata.google.internal',
  'metadata.goog',
  'instance-data',
  'instance-data.ec2.internal',
])

export class UrlBlockedError extends Error {
  constructor(message) {
    super(message)
    this.name = 'UrlBlockedError'
  }
}

function ipv4Blocked(ip) {
  const [a, b] = ip.split('.').map(Number)
  if (a === 10 || a === 127 || a === 0) return true
  if (a === 169 && b === 254) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 192 && b === 168) return true
  if (a === 100 && b >= 64 && b <= 127) return true
  if (a >= 224) return true
  return false
}

function ipv6Blocked(ip) {
  const addr = ip.toLowerCase()
  if (addr === '::1' || addr === '::') return true
  if (addr.startsWith('fe80')) return true
  if (addr.startsWith('fc') || addr.startsWith('fd')) return true
  if (addr.startsWith('ff')) return true
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(addr)
  if (mapped) return ipv4Blocked(mapped[1])
  return false
}

export function addressBlocked(ip) {
  const family = isIP(ip)
  if (family === 4) return ipv4Blocked(ip)
  if (family === 6) return ipv6Blocked(ip)
  return true
}

export function isLoopbackAddress(ip) {
  if (isIP(ip) === 4) return ip.startsWith('127.')
  const addr = ip.toLowerCase().split('%')[0]
  return addr === '::1' || addr === '::ffff:127.0.0.1' || addr.startsWith('::ffff:127.')
}

function literalIp(hostname) {
  const bare = hostname.startsWith('[') && hostname.endsWith(']') ? hostname.slice(1, -1) : hostname
  const noZone = bare.split('%')[0]
  return isIP(noZone) !== 0 ? noZone : null
}

function isLoopbackHostname(hostname) {
  const bare = hostname.replace(/\.$/, '')
  return bare === 'localhost' || bare.endsWith('.localhost')
}

/** Sync, pre-DNS guard: scheme allowlist + hostname blocklist + literal IPs. */
export function assertUrlAllowed(rawUrl, options = {}) {
  let url
  try {
    url = new URL(rawUrl)
  } catch {
    throw new UrlBlockedError(`invalid url "${rawUrl}"`)
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new UrlBlockedError(`url scheme "${url.protocol}" is blocked — only http/https are allowed`)
  }
  const hostname = url.hostname.toLowerCase()
  const literal = literalIp(hostname)
  if (literal) {
    if (addressBlocked(literal) && !(options.localhostMode === true && isLoopbackAddress(literal))) {
      throw new UrlBlockedError(`url "${hostname}" points at a blocked address (${literal})`)
    }
    return url
  }
  if (isLoopbackHostname(hostname) && options.localhostMode !== true) {
    throw new UrlBlockedError(`host "${hostname}" is blocked — use localhostMode for local development`)
  }
  const bare = hostname.replace(/\.$/, '')
  if (!isLoopbackHostname(bare) && BLOCKED_HOSTNAMES.has(bare)) {
    throw new UrlBlockedError(`host "${hostname}" is a blocked metadata/instance endpoint`)
  }
  return url
}

export function checkResolvedAddress(url, addresses, options = {}) {
  for (const address of addresses) {
    if (addressBlocked(address) && !(options.localhostMode === true && isLoopbackAddress(address))) {
      throw new UrlBlockedError(`url "${url.host}" resolves to a blocked address (${address})`)
    }
  }
}

/** Full guard: sync checks + DNS resolution class-checked on every address. */
export async function assertUrlAllowedAsync(rawUrl, options = {}) {
  const url = assertUrlAllowed(rawUrl, options)
  if (literalIp(url.hostname)) return url
  let resolved
  try {
    resolved = await dnsPromises.lookup(url.hostname.replace(/\.$/, ''), { all: true, verbatim: true })
  } catch {
    throw new UrlBlockedError(`cannot resolve host "${url.hostname}" — refusing to fetch`)
  }
  checkResolvedAddress(
    url,
    resolved.map((entry) => entry.address),
    options,
  )
  return url
}

// ---------------------------------------------------------------------------
// shared guarded fetch plumbing
// ---------------------------------------------------------------------------

export function requireNonEmptyString(value, message) {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(message)
  return value.trim()
}

export function positiveInt(value, fallback, message) {
  if (value === undefined || value === null) return fallback
  const n = Number(value)
  if (!Number.isInteger(n) || n <= 0) throw new Error(message)
  return n
}

export function asStringRecord(value, label) {
  if (value === undefined || value === null) return {}
  if (typeof value !== 'object' || Array.isArray(value))
    throw new Error(`${label} must be an object of string values`)
  const out = {}
  for (const [key, entry] of Object.entries(value)) out[key] = String(entry)
  return out
}

/** Mask anything credential-shaped in log output. */
export function redact(message) {
  return message
    .replace(/(authorization|api[-_]?key|token|secret|x-api-key|password)="?[\w./+=-]+"?/gi, '$1=[redacted]')
    .replace(/\b(sk|pk|ghp|gho|github_pat|xoxb|xoxp)-[\w-]{8,}/g, '[redacted]')
    .replace(/\bBearer\s+[\w./+=-]+/gi, 'Bearer [redacted]')
}

/** Permission gate: denied scopes throw a typed error (P13.06). */
export function requirePermission(ctx, capabilityId, scope) {
  if (!ctx.granted.has(scope)) {
    const error = new Error(
      `capability "${capabilityId}" requires ${scope} permission, which is not granted in this project`,
    )
    error.name = 'PermissionDeniedError'
    throw error
  }
}

function linkAbort(signal, timeoutMs, controller, label) {
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
    mapError(err) {
      if (state.timedOut) return new Error(`${label} timed out after ${timeoutMs}ms`)
      if (state.cancelled) return new Error(`${label} cancelled`)
      const message = err instanceof Error ? err.message : String(err)
      return new Error(`${label} failed: ${message}`)
    },
    dispose() {
      clearTimeout(timer)
      signal.removeEventListener('abort', onAbort)
      controller.abort()
    },
  }
}

function isRedirectStatus(status) {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308
}

async function readBodyCapped(response, maxBytes, controller, label, abort) {
  if (!response.body) return Buffer.alloc(0)
  const stream = Readable.fromWeb(response.body)
  const chunks = []
  let total = 0
  try {
    for await (const chunk of stream) {
      const buf = Buffer.from(chunk)
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

function lowercaseHeaders(headers) {
  const out = {}
  for (const [key, value] of headers.entries()) {
    const lower = key.toLowerCase()
    out[lower] = lower in out ? `${out[lower]}, ${value}` : value
  }
  return out
}

/**
 * fetch with the full guard discipline: url guard, manual redirects
 * re-validated on EVERY hop, timeout linked to the ctx signal, body capped.
 */
export async function guardedFetch(input) {
  const label = input.label
  const timeoutMs = positiveInt(input.timeoutMs, DEFAULT_TIMEOUT_MS, `${label}: timeoutMs must be a positive integer`)
  const maxBytes = positiveInt(input.maxBytes, DEFAULT_MAX_BYTES, `${label}: maxBytes must be a positive integer`)
  const maxRedirects = positiveInt(input.maxRedirects ?? MAX_REDIRECTS, MAX_REDIRECTS, `${label}: invalid maxRedirects`)
  const guardOptions = { localhostMode: input.allowLocal === true }

  if (input.signal.aborted) throw new Error(`${label} cancelled`)
  let current = await assertUrlAllowedAsync(input.url, guardOptions)
  const controller = new AbortController()
  const abort = linkAbort(input.signal, timeoutMs, controller, label)
  try {
    let hops = 0
    for (;;) {
      let response
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
        if (!location) throw new Error(`${label}: redirect ${response.status} carries no location header`)
        hops += 1
        if (hops > maxRedirects) throw new Error(`${label}: too many redirects (limit ${maxRedirects})`)
        let next
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

// ---------------------------------------------------------------------------
// regex html helpers (no dependencies; never innerHTML/eval)
// ---------------------------------------------------------------------------

const NAMED_ENTITIES = {
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

export function decodeHtmlEntities(text) {
  return text.replace(/&(#[xX]?[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/g, (match, body) => {
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

export function extractHtmlTitle(html) {
  const match = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)
  if (!match) return ''
  return decodeHtmlEntities(match[1].replace(/\s+/g, ' ').trim())
}

export function extractHtmlText(html) {
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

export function isTextualContentType(contentType) {
  const mime = contentType.split(';')[0].trim().toLowerCase()
  if (mime === '') return false
  if (mime.startsWith('text/')) return true
  if (mime === 'application/json' || mime === 'application/xhtml+xml' || mime === 'application/xml') return true
  if (mime.endsWith('+json') || mime.endsWith('+xml')) return true
  return false
}

function isHtmlContentType(contentType) {
  const mime = contentType.split(';')[0].trim().toLowerCase()
  return mime === 'text/html' || mime === 'application/xhtml+xml'
}

// ---------------------------------------------------------------------------
// capability
// ---------------------------------------------------------------------------

export async function execute(input, ctx) {
  requirePermission(ctx, 'web_fetch', 'network')
  if (ctx.signal.aborted) throw new Error('web_fetch cancelled')

  const url = requireNonEmptyString(input.url, 'web_fetch: "url" is required and must be a non-empty string')
  const maxBytes = positiveInt(input.maxBytes, DEFAULT_MAX_BYTES, 'web_fetch: maxBytes must be a positive integer')
  const timeoutMs = positiveInt(input.timeoutMs, DEFAULT_TIMEOUT_MS, 'web_fetch: timeoutMs must be a positive integer')
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
}
