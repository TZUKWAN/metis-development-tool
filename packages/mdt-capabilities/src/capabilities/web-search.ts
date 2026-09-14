/**
 * `web_search` capability (tasklist P09.09): web search through pluggable
 * providers. 1.0 ships a DuckDuckGo HTML-lite provider (same SSRF guard +
 * fetch discipline as web_fetch) and a deterministic mock provider for
 * tests. Third-party apps register additional providers at boot.
 */
import { redact, requirePermission } from '../context'
import type { Capability, CapabilityContext } from '../manifest'
import { decodeHtmlEntities, extractHtmlText, guardedFetch } from './web-fetch'

export interface SearchResult {
  title: string
  url: string
  snippet: string
}

export interface SearchProvider {
  readonly id: string
  /** true when the provider cannot run without the `api_key` secret */
  readonly requiresApiKey?: boolean
  search(
    query: string,
    opts: { count: number; apiKey?: string; signal: AbortSignal },
  ): Promise<SearchResult[]>
}

/** Registry of search providers (mock + duckduckgo preloaded; apps may add). */
export const searchProviders: Map<string, SearchProvider> = new Map()

export function registerSearchProvider(provider: SearchProvider): void {
  if (typeof provider?.id !== 'string' || provider.id.trim() === '') {
    throw new Error('registerSearchProvider: provider must have a non-empty string id')
  }
  if (typeof provider.search !== 'function') {
    throw new Error(`registerSearchProvider: provider "${provider.id}" must implement search()`)
  }
  searchProviders.set(provider.id, provider)
}

const MAX_RESULTS = 10

// ---------------------------------------------------------------------------
// DuckDuckGo HTML-lite provider (regex parsing, no dependencies)
// ---------------------------------------------------------------------------

const DDG_ENDPOINT = 'https://html.duckduckgo.com/html/'

const duckDuckGoProvider: SearchProvider = {
  id: 'duckduckgo',
  async search(query, { count, signal }) {
    const result = await guardedFetch({
      url: `${DDG_ENDPOINT}?q=${encodeURIComponent(query)}`,
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

/** Extract result links + snippets from the DuckDuckGo html-lite markup. */
export function parseDuckDuckGoResults(html: string, count: number): SearchResult[] {
  const linkRe = /<a[^>]+class="[^"]*\bresult__a\b[^"]*"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g
  const snippetRe = /<a[^>]+class="[^"]*\bresult__snippet\b[^"]*"[^>]*>([\s\S]*?)<\/a>/g
  const titles: { url: string; title: string }[] = []
  for (const match of matchAll(linkRe, html)) {
    titles.push({ url: resolveDuckDuckGoLink(match[1]), title: cleanText(match[2]) })
  }
  const snippets = [...matchAll(snippetRe, html)].map((m) => cleanText(m[1]))
  const results: SearchResult[] = []
  for (let i = 0; i < titles.length && results.length < count; i++) {
    const entry = titles[i]
    if (!entry.url || !entry.title) continue
    results.push({ title: entry.title, url: entry.url, snippet: snippets[i] ?? '' })
  }
  return results
}

function* matchAll(re: RegExp, text: string): Generator<RegExpExecArray> {
  const regex = new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`)
  let match = regex.exec(text)
  while (match !== null) {
    yield match
    match = regex.exec(text)
  }
}

/** DuckDuckGo wraps outbound links in /l/?uddg=<encoded>; unwrap when present. */
function resolveDuckDuckGoLink(href: string): string {
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

function cleanText(html: string): string {
  return extractHtmlText(html).replace(/\s+/g, ' ').trim()
}

// ---------------------------------------------------------------------------
// Mock provider (deterministic, for tests and offline development)
// ---------------------------------------------------------------------------

const mockProvider: SearchProvider = {
  id: 'mock',
  async search(query, { count }) {
    const results: SearchResult[] = []
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

// ---------------------------------------------------------------------------
// capability
// ---------------------------------------------------------------------------

export const webSearchCapability: Capability = {
  manifest: {
    id: 'web_search',
    name: 'Web Search',
    version: '1.0.0',
    category: 'web',
    description:
      'Search the web through a pluggable provider (DuckDuckGo html-lite by default) and return title/url/snippet results.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'search query' },
        count: { type: 'number', description: 'result count, 1–10 (default 5)' },
        provider: { type: 'string', description: `provider id (default 'duckduckgo')` },
      },
      required: ['query'],
      additionalProperties: false,
    },
    outputSchema: {
      type: 'object',
      properties: {
        results: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              title: { type: 'string' },
              url: { type: 'string' },
              snippet: { type: 'string' },
            },
            required: ['title', 'url', 'snippet'],
          },
        },
        provider: { type: 'string' },
      },
      required: ['results', 'provider'],
      additionalProperties: false,
    },
    permissions: [
      {
        scope: 'network',
        detail: 'http(s) GET fetch to the search provider',
        required: true,
        defaultGranted: true,
      },
    ],
    secrets: [
      {
        name: 'api_key',
        description: 'API key for providers that require one (e.g. bearer-key search APIs)',
        required: false,
      },
    ],
    ui: {
      icon: '🔍',
      accent: '#5b8def',
      summary: 'Search the web and return ranked results',
      keywords: ['search', 'web', 'duckduckgo', 'query'],
      doc: 'web-search',
    },
    timeoutMs: 30_000,
    maxOutputBytes: 1_000_000,
  },
  async execute(
    input: Record<string, unknown>,
    ctx: CapabilityContext,
  ): Promise<Record<string, unknown>> {
    requirePermission(ctx, webSearchCapability, 'network')
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
  },
}

function normalizeCount(value: unknown): number {
  if (value === undefined || value === null) return 5
  const n = Number(value)
  if (!Number.isFinite(n)) throw new Error('web_search: count must be a number')
  return Math.max(1, Math.min(MAX_RESULTS, Math.trunc(n)))
}
