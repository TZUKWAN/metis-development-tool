/**
 * `http_request` capability (tasklist P09.08-adjacent): general http(s)
 * calls with the same SSRF guard discipline as web_fetch (per-hop redirect
 * re-validation, timeout, body size caps). Secret header values use the
 * `${secret:NAME}` interpolation resolved from the context secure store.
 */
import { redact, requirePermission } from '../context'
import type { Capability, CapabilityContext } from '../manifest'
import { asStringRecord, guardedFetch, positiveInt, requireNonEmptyString } from './web-fetch'

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'head'] as const
const DEFAULT_TIMEOUT_MS = 20_000
const DEFAULT_MAX_BYTES = 2_000_000
const MAX_REDIRECTS = 3

const SECRET_HEADER_RE = /^\$\{secret:([A-Za-z0-9_]+)\}$/

export const httpRequestCapability: Capability = {
  manifest: {
    id: 'http_request',
    name: 'HTTP Request',
    version: '1.0.0',
    category: 'http',
    description:
      'Call an http(s) endpoint with full control over method, headers, query and body, with SSRF guards and response size limits.',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'absolute http(s) url' },
        method: { type: 'string', enum: [...HTTP_METHODS], description: 'default get' },
        headers: {
          type: 'object',
          description: 'record of header name → value; values may reference ${secret:NAME}',
        },
        query: { type: 'object', description: 'record of query parameters appended to the url' },
        body: { type: 'string', description: 'raw request body' },
        json: { description: 'JSON body — serialized automatically with a json content-type' },
        timeoutMs: { type: 'number', description: 'default 20000' },
        maxBytes: { type: 'number', description: 'response size cap in bytes (default 2000000)' },
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
        status: { type: 'number' },
        statusText: { type: 'string' },
        headers: { type: 'object', description: 'response headers, lowercase keys' },
        body: { type: 'string' },
        json: { description: 'parsed body when the content-type is json' },
      },
      required: ['status', 'statusText', 'headers', 'body'],
      additionalProperties: false,
    },
    permissions: [
      { scope: 'network', detail: 'http(s) requests', required: true, defaultGranted: true },
    ],
    secrets: [],
    ui: {
      icon: '📡',
      accent: '#5b8def',
      summary: 'Call any http(s) API endpoint',
      keywords: ['http', 'api', 'rest', 'request'],
      doc: 'http-request',
    },
    timeoutMs: 30_000,
    maxOutputBytes: 2_000_000,
  },
  async execute(
    input: Record<string, unknown>,
    ctx: CapabilityContext,
  ): Promise<Record<string, unknown>> {
    requirePermission(ctx, httpRequestCapability, 'network')
    if (ctx.signal.aborted) throw new Error('http_request cancelled')

    const rawUrl = requireNonEmptyString(
      input.url,
      'http_request: "url" is required and must be a non-empty string',
    )
    const method = normalizeMethod(input.method)
    const timeoutMs = positiveInt(
      input.timeoutMs,
      DEFAULT_TIMEOUT_MS,
      'http_request: timeoutMs must be a positive integer',
    )
    const maxBytes = positiveInt(
      input.maxBytes,
      DEFAULT_MAX_BYTES,
      'http_request: maxBytes must be a positive integer',
    )
    const allowLocal = input.allowLocal === true

    if (input.body !== undefined && input.json !== undefined) {
      throw new Error('http_request: pass either "body" or "json", not both')
    }
    const headers = asStringRecord(input.headers, 'http_request: "headers"')
    const requestBody =
      input.json !== undefined
        ? JSON.stringify(input.json)
        : input.body === undefined
          ? undefined
          : String(input.body)
    if (input.json !== undefined && headers['content-type'] === undefined) {
      headers['content-type'] = 'application/json'
    }
    const resolvedHeaders = resolveSecretHeaders(headers, ctx)

    // build the final url (query record appended) before guarding it
    let target: URL
    try {
      target = new URL(rawUrl)
    } catch {
      throw new Error(`http_request: "${rawUrl}" is not a valid url`)
    }
    for (const [key, value] of Object.entries(
      asStringRecord(input.query, 'http_request: "query"'),
    )) {
      target.searchParams.append(key, value)
    }

    const result = await guardedFetch({
      url: target.href,
      label: 'http_request',
      method,
      headers: resolvedHeaders,
      body: requestBody,
      timeoutMs,
      maxBytes,
      allowLocal,
      maxRedirects: MAX_REDIRECTS,
      skipBody: method === 'HEAD',
      signal: ctx.signal,
    })

    const text = new TextDecoder('utf-8', { fatal: false }).decode(result.bodyBytes)
    ctx.log(
      `http_request ${method} ${redact(target.href)} -> ${result.status} bytes=${result.bytes}`,
    )
    const output: Record<string, unknown> = {
      status: result.status,
      statusText: result.statusText,
      headers: result.headers,
      body: text,
    }
    const contentType = result.contentType.toLowerCase()
    if (contentType.includes('json')) {
      let parsed: unknown
      try {
        parsed = JSON.parse(text)
      } catch (err) {
        throw new Error(
          `http_request: response declared json but the body failed to parse: ${(err as Error).message}`,
          { cause: err },
        )
      }
      output.json = parsed as Record<string, unknown>
    }
    return output
  },
}

function normalizeMethod(value: unknown): string {
  const method =
    value === undefined || value === null || value === '' ? 'get' : String(value).toLowerCase()
  if (!(HTTP_METHODS as readonly string[]).includes(method)) {
    throw new Error(
      `http_request: method must be one of ${HTTP_METHODS.join('/')} — got "${method}"`,
    )
  }
  return method.toUpperCase()
}

/** Replace `${secret:NAME}` header values from ctx.secrets; missing → clear error. */
function resolveSecretHeaders(
  headers: Record<string, string>,
  ctx: CapabilityContext,
): Record<string, string> {
  const resolved: Record<string, string> = {}
  for (const [name, value] of Object.entries(headers)) {
    const match = SECRET_HEADER_RE.exec(value.trim())
    if (!match) {
      resolved[name] = value
      continue
    }
    const secretName = match[1]
    const secretValue = ctx.secrets[secretName]
    if (secretValue === undefined) {
      throw new Error(
        `http_request: header "${name}" references the secret "${secretName}", which is not configured — add it in Capability inspector`,
      )
    }
    resolved[name] = secretValue
  }
  return resolved
}
