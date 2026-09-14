/**
 * Self-contained `http_request` capability for generated apps (generator-owned
 * runtime source; emitted verbatim into server/capabilities/http_request.js).
 * Plain JS, zero npm dependencies; reuses the guarded fetch plumbing from
 * ./web_fetch.js (SSRF guard, per-hop redirect re-validation, size caps).
 * `${secret:NAME}` header values are resolved from ctx.secrets.
 */
import {
  asStringRecord,
  guardedFetch,
  positiveInt,
  redact,
  requireNonEmptyString,
  requirePermission,
} from './web_fetch.js'

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'head']
const DEFAULT_TIMEOUT_MS = 20_000
const DEFAULT_MAX_BYTES = 2_000_000
const MAX_REDIRECTS = 3

const SECRET_HEADER_RE = /^\$\{secret:([A-Za-z0-9_]+)\}$/

function resolveSecretHeaders(headers, secrets) {
  const resolved = {}
  for (const [name, raw] of Object.entries(headers)) {
    const match = SECRET_HEADER_RE.exec(raw)
    if (match) {
      const value = secrets[match[1]]
      if (value === undefined) {
        throw new Error(`http_request: secret "${match[1]}" is not configured for this instance`)
      }
      resolved[name] = value
    } else {
      resolved[name] = raw
    }
  }
  return resolved
}

export async function execute(input, ctx) {
  requirePermission(ctx, 'http_request', 'network')
  if (ctx.signal.aborted) throw new Error('http_request cancelled')

  const url = requireNonEmptyString(input.url, 'http_request: "url" is required and must be a non-empty string')
  const method = String(input.method ?? 'get').toLowerCase()
  if (!HTTP_METHODS.includes(method)) {
    throw new Error(`http_request: method "${method}" is not one of ${HTTP_METHODS.join(', ')}`)
  }
  const timeoutMs = positiveInt(input.timeoutMs, DEFAULT_TIMEOUT_MS, 'http_request: timeoutMs must be a positive integer')
  const maxBytes = positiveInt(input.maxBytes, DEFAULT_MAX_BYTES, 'http_request: maxBytes must be a positive integer')
  const allowLocal = input.allowLocal === true
  const headers = asStringRecord(input.headers, 'http_request: headers')
  const query = asStringRecord(input.query, 'http_request: query')

  let body = typeof input.body === 'string' ? input.body : undefined
  let finalHeaders = { ...headers }
  if (input.json !== undefined) {
    body = JSON.stringify(input.json)
    if (!Object.keys(finalHeaders).some((key) => key.toLowerCase() === 'content-type')) {
      finalHeaders['content-type'] = 'application/json'
    }
  }
  finalHeaders = resolveSecretHeaders(finalHeaders, ctx.secrets)

  const target = new URL(url)
  for (const [key, value] of Object.entries(query)) target.searchParams.set(key, value)

  const result = await guardedFetch({
    url: target.href,
    label: 'http_request',
    method: method.toUpperCase(),
    headers: finalHeaders,
    body,
    timeoutMs,
    maxBytes,
    allowLocal,
    maxRedirects: MAX_REDIRECTS,
    signal: ctx.signal,
  })
  ctx.log(`http_request ${method.toUpperCase()} ${redact(target.href)} -> ${result.status}`)

  const text = new TextDecoder('utf-8', { fatal: false }).decode(result.bodyBytes)
  let parsedJson
  const contentType = result.contentType.split(';')[0].trim().toLowerCase()
  if (contentType === 'application/json' || contentType.endsWith('+json')) {
    try {
      parsedJson = JSON.parse(text)
    } catch {
      parsedJson = undefined
    }
  }
  return {
    status: result.status,
    statusText: result.statusText,
    headers: result.headers,
    body: text,
    ...(parsedJson !== undefined ? { json: parsedJson } : {}),
  }
}
