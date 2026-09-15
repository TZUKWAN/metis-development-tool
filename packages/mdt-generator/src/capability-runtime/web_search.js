/**
 * Self-contained `web_search` capability for generated apps (generator-owned
 * runtime source; emitted verbatim into server/capabilities/web_search.js).
 * Plain JS, zero npm dependencies; fetches through the guarded plumbing in
 * ./web_fetch.js. Ships the DuckDuckGo html-lite provider plus a
 * deterministic mock provider for tests/offline development.
 */
import {
  decodeHtmlEntities,
  extractHtmlText,
  guardedFetch,
  redact,
  requirePermission,
} from './web_fetch.js'

export const searchProviders = new Map()

export function registerSearchProvider(provider) {
  if (typeof provider?.id !== 'string' || provider.id.trim() === '') {
    throw new Error('registerSearchProvider: provider must have a non-empty string id')
  }
  if (typeof provider.search !== 'function') {
    throw new Error(`registerSearchProvider: provider "${provider.id}" must implement search()`)
  }
  searchProviders.set(provider.id, provider)
}

const MAX_RESULTS = 10

const duckDuckGoProvider = {
  id: 'duckduckgo',
  async search(query, { count, signal }) {
    const result = await guardedFetch({
      url: `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`,
      label: 'web_search(duckduckgo)',
      method: 'GET',
      timeoutMs: 20_000,
      maxBytes: 1_000_000,
      allowLocal: false,
      maxRedirects: 5,
      signal,
    })
    if (result.status !== 200) {
      throw new Error(`web_search(duckduckgo): search endpoint returned status ${result.status}`)
    }
    const html = new TextDecoder('utf-8', { fatal: false }).decode(result.bodyBytes)
    return parseDuckDuckGoResults(html, count)
  },
}

export function parseDuckDuckGoResults(html, count) {
  const linkRe = /<a[^>]+class="[^"]*\bresult__a\b[^"]*"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g
  const snippetRe = /<a[^>]+class="[^"]*\bresult__snippet\b[^"]*"[^>]*>([\s\S]*?)<\/a>/g
  const titles = []
  for (const match of matchAll(linkRe, html)) {
    titles.push({ url: resolveDuckDuckGoLink(match[1]), title: cleanText(match[2]) })
  }
  const snippets = [...matchAll(snippetRe, html)].map((m) => cleanText(m[1]))
  const results = []
  for (let i = 0; i < titles.length && results.length < count; i++) {
    const entry = titles[i]
    if (!entry.url || !entry.title) continue
    results.push({ title: entry.title, url: entry.url, snippet: snippets[i] ?? '' })
  }
  return results
}

function* matchAll(re, text) {
  const regex = new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`)
  let match = regex.exec(text)
  while (match !== null) {
    yield match
    match = regex.exec(text)
  }
}

function resolveDuckDuckGoLink(href) {
  const raw = decodeHtmlEntities(href).replace(/&amp;/g, '&')
  const absolute = raw.startsWith('//') ? `https:${raw}` : raw
  try {
    const url = new URL(absolute)
    const uddg = url.searchParams.get('uddg')
    if (uddg) return uddg
    return url.href
  } catch {
    return raw
  }
}

function cleanText(html) {
  return extractHtmlText(html).replace(/\s+/g, ' ').trim()
}

const mockProvider = {
  id: 'mock',
  async search(query, { count }) {
    const results = []
    for (let i = 1; i <= Math.min(count, MAX_RESULTS); i++) {
      results.push({
        title: `Mock result ${i}: ${query}`,
        url: `https://example.test/mock/${i}?q=${encodeURIComponent(query)}`,
        snippet: `Deterministic mock snippet ${i} for the query "${query}".`,
      })
    }
    return results
  },
}

registerSearchProvider(duckDuckGoProvider)
registerSearchProvider(mockProvider)

function normalizeCount(value) {
  if (value === undefined || value === null) return 5
  const n = Number(value)
  if (!Number.isFinite(n)) throw new Error('web_search: count must be a number')
  return Math.max(1, Math.min(MAX_RESULTS, Math.trunc(n)))
}

export async function execute(input, ctx) {
  requirePermission(ctx, 'web_search', 'network')
  if (ctx.signal.aborted) throw new Error('web_search cancelled')

  const query =
    typeof input.query === 'string' && input.query.trim() !== '' ? input.query.trim() : null
  if (!query) throw new Error('web_search: "query" is required and must be a non-empty string')

  const count = normalizeCount(input.count)
  const providerName =
    typeof input.provider === 'string' && input.provider.trim() !== ''
      ? input.provider.trim()
      : 'duckduckgo'
  const provider = searchProviders.get(providerName)
  if (!provider) {
    throw new Error(
      `web_search: unknown provider "${providerName}" — registered providers: ${[...searchProviders.keys()].sort().join(', ')}`,
    )
  }
  const apiKey = ctx.secrets.api_key
  if (provider.requiresApiKey === true && !apiKey) {
    throw new Error(
      `web_search provider ${providerName} requires the api_key secret — configure it in Capability inspector`,
    )
  }

  ctx.log(`web_search provider=${providerName} count=${count} query=${redact(query)}`)
  const results = await provider.search(query, { count, apiKey, signal: ctx.signal })
  return {
    results: results.slice(0, count).map((r) => ({
      title: String(r?.title ?? ''),
      url: String(r?.url ?? ''),
      snippet: String(r?.snippet ?? ''),
    })),
    provider: providerName,
  }
}
