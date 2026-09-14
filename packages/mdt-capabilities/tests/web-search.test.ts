/**
 * web_search tests: provider abstraction, mock provider, api-key gating and
 * the DuckDuckGo HTML parser (pure regex — no network anywhere).
 */
import { afterEach, describe, expect, it } from 'vitest'

import { createCapabilityContext } from '../src/context'
import {
  parseDuckDuckGoResults,
  registerSearchProvider,
  searchProviders,
  webSearchCapability,
  type SearchProvider,
} from '../src/capabilities/web-search'
import { runCapabilityContractTests } from '../src/testing'

const grantedCtx = createCapabilityContext({ granted: ['network'] })

runCapabilityContractTests(
  webSearchCapability,
  { granted: ['network'] },
  { happyInput: { query: 'capability registry', count: 2, provider: 'mock' }, invalidInput: { query: '' } },
)

describe('provider registry', () => {
  afterEach(() => {
    searchProviders.delete('keyed_test')
  })

  it('ships duckduckgo and mock providers', () => {
    expect(searchProviders.get('duckduckgo')).toBeDefined()
    expect(searchProviders.get('mock')).toBeDefined()
  })

  it('rejects providers without a usable id', () => {
    expect(() => registerSearchProvider({ id: '', search: async () => [] })).toThrow(/non-empty string id/)
  })

  it('registers custom providers', () => {
    const provider: SearchProvider = { id: 'keyed_test', search: async () => [{ title: 't', url: 'u', snippet: 's' }] }
    registerSearchProvider(provider)
    expect(searchProviders.get('keyed_test')).toBe(provider)
  })
})

describe('web_search behavior', () => {
  it('mock provider returns deterministic results', async () => {
    const first = await webSearchCapability.execute({ query: 'cats', count: 3, provider: 'mock' }, grantedCtx)
    const second = await webSearchCapability.execute({ query: 'cats', count: 3, provider: 'mock' }, grantedCtx)
    expect(first).toEqual(second)
    expect(first.provider).toBe('mock')
    const results = first.results as { title: string; url: string; snippet: string }[]
    expect(results).toHaveLength(3)
    expect(results[0].title).toBe('Mock result 1: cats')
    expect(results[0].url).toContain(encodeURIComponent('cats'))
  })

  it('clamps count into the 1–10 range', async () => {
    const out = await webSearchCapability.execute({ query: 'q', count: 50, provider: 'mock' }, grantedCtx)
    expect((out.results as unknown[]).length).toBe(10)
  })

  it('defaults to the duckduckgo provider id', async () => {
    await expect(webSearchCapability.execute({ query: 'q', provider: 'nope' }, grantedCtx)).rejects.toThrow(
      /unknown provider "nope" — registered providers: duckduckgo, mock/,
    )
  })

  it('passes count, apiKey and the abort signal to the provider', async () => {
    const seen: { count?: number; apiKey?: string; isSignal?: boolean } = {}
    registerSearchProvider({
      id: 'keyed_test',
      requiresApiKey: true,
      async search(query, opts) {
        seen.count = opts.count
        seen.apiKey = opts.apiKey
        seen.isSignal = opts.signal instanceof AbortSignal
        return [{ title: `result for ${query}`, url: 'https://example.test/1', snippet: 's' }]
      },
    })
    const ctx = createCapabilityContext({ granted: ['network'], secrets: { api_key: 'key-value-123' } })
    const out = await webSearchCapability.execute({ query: 'q', count: 4, provider: 'keyed_test' }, ctx)
    expect(seen).toEqual({ count: 4, apiKey: 'key-value-123', isSignal: true })
    expect(out.provider).toBe('keyed_test')
  })

  it('demands the api_key secret with a clear message instead of crashing', async () => {
    registerSearchProvider({
      id: 'keyed_test',
      requiresApiKey: true,
      async search() {
        return []
      },
    })
    await expect(webSearchCapability.execute({ query: 'q', provider: 'keyed_test' }, grantedCtx)).rejects.toThrow(
      'web_search provider keyed_test requires the api_key secret — configure it in Capability inspector',
    )
  })
})

describe('duckduckgo html parsing (offline, regex)', () => {
  it('parses result links and snippets, unwrapping uddg redirects', () => {
    const html = [
      '<html><body>',
      '<div class="result">',
      '<a rel="nofollow" class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fa&amp;rut=xyz">Result <b>One</b></a>',
      '<a class="result__snippet">First &amp; foremost snippet</a>',
      '</div>',
      '<div class="result">',
      '<a class="result__a" href="https://direct.example.com/b">Result Two</a>',
      '<a class="result__snippet">Second snippet</a>',
      '</div>',
      '</body></html>',
    ].join('\n')
    const results = parseDuckDuckGoResults(html, 5)
    expect(results).toEqual([
      { title: 'Result One', url: 'https://example.com/a', snippet: 'First & foremost snippet' },
      { title: 'Result Two', url: 'https://direct.example.com/b', snippet: 'Second snippet' },
    ])
  })

  it('honours the requested count', () => {
    const html =
      '<a class="result__a" href="https://a.example/1">t1</a><a class="result__a" href="https://a.example/2">t2</a>' +
      '<a class="result__a" href="https://a.example/3">t3</a>'
    expect(parseDuckDuckGoResults(html, 2)).toHaveLength(2)
  })
})
