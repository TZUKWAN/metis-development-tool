import { describe, expect, it } from 'vitest'

import { createCapabilityContext } from '../src/context'
import { runCapabilityContractTests } from '../src/testing'
import { datetimeCapability } from '../src/capabilities/datetime'
import { jsonCapability, queryPath } from '../src/capabilities/json'
import { askUserCapability } from '../src/capabilities/ask-user'

runCapabilityContractTests(datetimeCapability, {}, { happyInput: { operation: 'now' } })
runCapabilityContractTests(
  jsonCapability,
  {},
  { happyInput: { operation: 'stringify', value: { ok: 1 } } },
)
runCapabilityContractTests(
  askUserCapability,
  { askUser: async () => ({ answered: true, value: 'blue' }) },
  { happyInput: { kind: 'text', question: 'q?' } },
)

describe('datetime', () => {
  it('now returns an ISO instant plus formatted value', async () => {
    const out = (await datetimeCapability.execute(
      { operation: 'now' },
      createCapabilityContext(),
    )) as {
      iso: string
      result: string
      timezone: string
    }
    expect(new Date(out.iso).getTime()).not.toBeNaN()
    expect(out.timezone).toBe('UTC')
    expect(out.result.length).toBeGreaterThan(0)
  })

  it('add shifts by the requested unit', async () => {
    const out = (await datetimeCapability.execute(
      { operation: 'add', value: '2026-01-01T00:00:00Z', amount: 2, unit: 'days' },
      createCapabilityContext(),
    )) as { iso: string }
    expect(new Date(out.iso).toISOString()).toContain('2026-01-03')
  })

  it('diff reports signed seconds', async () => {
    const out = (await datetimeCapability.execute(
      { operation: 'diff', value: '2026-01-01T00:00:00Z', compare: '2026-01-01T01:00:00Z' },
      createCapabilityContext(),
    )) as { result: string }
    expect(out.result).toBe('3600s')
  })

  it('rejects malformed dates and unknown timezones with clear errors', async () => {
    const ctx = createCapabilityContext()
    await expect(
      datetimeCapability.execute({ operation: 'parse', value: 'not-a-date' }, ctx),
    ).rejects.toThrow(/cannot parse/)
    await expect(
      datetimeCapability.execute({ operation: 'now', timezone: 'Mars/Olympus' }, ctx),
    ).rejects.toThrow(/unknown timezone/)
  })
})

describe('json', () => {
  it('parse extracts nested values by dot path (arrays via numeric segments)', async () => {
    const out = (await jsonCapability.execute(
      { operation: 'parse', text: '{"a": {"b": [ {"name": "x"} ]}}', path: 'a.b.0.name' },
      createCapabilityContext(),
    )) as { result: unknown; text: string }
    expect(out.result).toBe('x')
    expect(out.text).toBe('"x"')
  })

  it('parse failures are structured errors with the parser message', async () => {
    await expect(
      jsonCapability.execute({ operation: 'parse', text: '{broken' }, createCapabilityContext()),
    ).rejects.toThrow(/invalid JSON/)
  })

  it('queryPath validates every segment', () => {
    expect(queryPath({ a: [1, 2] }, 'a.1')).toBe(2)
    expect(() => queryPath({ a: [] }, 'a.5')).toThrow(/invalid array index/)
    expect(() => queryPath({ a: 1 }, 'a.b')).toThrow(/cannot descend/)
    expect(() => queryPath({ a: {} }, 'a.missing')).toThrow(/missing key/)
  })
})

describe('ask_user', () => {
  it('requires an options array for select questions', async () => {
    await expect(
      askUserCapability.execute({ kind: 'select', question: 'pick' }, createCapabilityContext()),
    ).rejects.toThrow(/options/)
  })

  it('resolves with the user answer from the ask bridge', async () => {
    const out = (await askUserCapability.execute(
      { kind: 'text', question: 'name?' },
      createCapabilityContext({
        askUser: async (req) => ({ answered: true, value: `answer to: ${req.question}` }),
      }),
    )) as { answered: boolean; value: string }
    expect(out.answered).toBe(true)
    expect(out.value).toBe('answer to: name?')
  })

  it('surfaces cancellation as a structured error (never hangs)', async () => {
    // cancellation wins against a PENDING bridge; an already-settled
    // bridge resolving first mirrors the TS adapter's race semantics
    const controller = new AbortController()
    const ctx = createCapabilityContext({
      signal: controller.signal,
      askUser: (_req: unknown, signal?: AbortSignal) =>
        new Promise((_, reject) => {
          signal?.addEventListener('abort', () => reject(new Error('ask cancelled')), {
            once: true,
          })
        }),
    })
    const run = askUserCapability.execute({ kind: 'text', question: 'q' }, ctx)
    controller.abort()
    await expect(run).rejects.toThrow(/cancel/)
  })
})
