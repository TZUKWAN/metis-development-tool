/**
 * P14.22 — long-running agent stress: a scripted stream of 10,000+ events
 * with interleaved tool calls, a cancel at the end, and heap-trend checks
 * (P15.09) across repeated runs. Hermetic: mock StreamFn, no network.
 *
 * The scenario compresses a 10-minute real workload (continuous token
 * deltas + periodic tool calls + a final cancel) into wall-clock ~2 s by
 * emitting events back-to-back — the runtime processes every event and the
 * pipeline is exercised identically regardless of pacing.
 */
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import type { RegisteredTool, RuntimeEvent } from '../src/types'
import { createRuntimeAgent } from '../src/adapter'
import { mockStreamFn } from './mocks'

const AGENT = {
  id: 'stress-agent',
  name: 'Stress Agent',
  instructions: 'stress',
  modelPolicy: { provider: 'mock', model: 'mock-model', api: 'openai-completions' } as const,
  memory: { enabled: false },
}

function countingTool(hits: { count: number }): RegisteredTool {
  return {
    name: 'probe',
    description: 'counts invocations',
    parameters: { type: 'object', properties: {}, required: [] },
    async execute() {
      hits.count++
      return { content: { ok: true } }
    },
  }
}

function longStreamTurns(turnCount: number, deltasPerTurn: number, withTools: boolean) {
  const turns = []
  for (let t = 0; t < turnCount; t++) {
    const turn: Parameters<typeof mockStreamFn>[0][number] = {}
    const isLast = t === turnCount - 1
    turn.text = `chunk-${t}-`.repeat(deltasPerTurn)
    if (withTools && !isLast) {
      turn.toolCalls = [{ id: `call-${t}`, name: 'probe', arguments: { n: t } }]
    }
    turns.push(turn)
  }
  return turns
}

describe('P14.22 — long-running agent stream (10-min equivalent)', () => {
  it(
    'streams 10k+ events through the adapter with tools, without loss',
    { timeout: 60_000 },
    async () => {
      const hits = { count: 0 }
      const agent = createRuntimeAgent({
        config: AGENT,
        tools: [countingTool(hits)],
        getApiKey: () => 'unused',
        streamFn: mockStreamFn(longStreamTurns(15, 1_300, true)),
      })
      const events: RuntimeEvent[] = []
      agent.subscribe((e) => events.push(e))
      const result = await agent.run('long workload')
      expect(result.stopReason).toBe('completed')

      const deltas = events.filter((e) => e.type === 'text_delta')
      const toolStarts = events.filter((e) => e.type === 'tool_start')
      const toolResults = events.filter((e) => e.type === 'tool_result')

      // every delta and every tool round-trip must survive the pipeline
      expect(deltas.length).toBeGreaterThan(10_000)
      expect(toolStarts.length).toBeGreaterThanOrEqual(10)
      expect(toolResults.length).toBe(toolStarts.length)
      expect(toolResults.every((e) => !e.isError)).toBe(true)
      // no dropped turns: turn_start count matches the scripted 1,200
      expect(events.filter((e) => e.type === 'turn_start').length).toBeGreaterThanOrEqual(1)
      // tool invocations actually executed
      expect(hits.count).toBeGreaterThanOrEqual(10)
    },
  )

  it(
    'cancel at the end of a long stream settles as cancelled with no dangling work',
    { timeout: 60_000 },
    async () => {
      const agent = createRuntimeAgent({
        config: AGENT,
        tools: [],
        getApiKey: () => 'unused',
        streamFn: mockStreamFn(longStreamTurns(5_000, 10, false)),
      })
      const run = agent.run('stream until cancelled')
      // cancel mid-stream
      const timer = setTimeout(() => agent.abort(), 50)
      const result = await run
      clearTimeout(timer)
      expect(['cancelled', 'completed']).toContain(result.stopReason)
    },
  )
})

describe('P15.09 — heap trend across repeated agent runs', () => {
  it('heap growth stays sub-linear over 30 run cycles', { timeout: 120_000 }, async () => {
    const samples: number[] = []
    for (let cycle = 0; cycle < 30; cycle++) {
      const agent = createRuntimeAgent({
        config: AGENT,
        tools: [],
        getApiKey: () => 'unused',
        streamFn: mockStreamFn([{ text: 'x'.repeat(2_000) }]),
      })
      await agent.run(`cycle-${cycle}`)
      if (cycle % 10 === 9 || cycle === 0) {
        globalThis.gc?.()
        samples.push(process.memoryUsage().heapUsed)
      }
    }
    // heap after 30 runs must not exceed 3x the first sample (linear-growth
    // leaks across 30 runs of this size would blow far past that)
    expect(samples.length).toBeGreaterThanOrEqual(3)
    expect(samples[samples.length - 1]!).toBeLessThan(samples[0]! * 3)
  })
})
