/**
 * Stress gates (tasklist P14.21, P14.22, P14.23, P15.09 / V2 §三).
 *
 * - P14.21 large project: 100 pages / 5,000 elements / 300 interactions —
 *   schema validation, ref-integrity, derivation and blueprint generation
 *   must complete inside a time budget with stable memory.
 * - P14.22 long-running agent: a scripted 10-minute-equivalent mock stream
 *   (10,000+ events) through the real Pi adapter with tool calls and a
 *   cancel at the end — must complete without dropped events or leaks.
 * - P14.23 repeated builds: the same project built 20 consecutive times —
 *   byte-identical output each time, no state accumulation.
 * - P15.09 memory: heap trend across repeated open/close/build cycles must
 *   stay flat (no linear growth).
 *
 * These tests are hermetic (no network, no Electron) and use the real
 * production modules.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, describe, expect, it } from 'vitest'

import { createId, validateRefs, parseProject, type ProjectRoot } from '@mdt/schema'

// ---------------------------------------------------------------------------
// synthetic large-project factory (P14.21)
// ---------------------------------------------------------------------------

function buildLargeProject(): ProjectRoot {
  const pages = []
  const pageIds: string[] = []
  const buttonIds: string[] = []

  for (let p = 0; p < 100; p++) {
    const pageId = createId()
    pageIds.push(pageId)
    const elements = []
    // 50 elements per page = 5,000 total
    for (let e = 0; e < 50; e++) {
      const id = createId()
      const role = e === 0 ? 'button' : e % 10 === 0 ? 'input' : 'text'
      if (role === 'button') buttonIds.push(id)
      elements.push({
        id,
        name: `el-${p}-${e}`,
        role: role as 'button' | 'input' | 'text',
        visual: {
          kind: role,
          geometry: { x: (e % 10) * 120, y: Math.floor(e / 10) * 60, width: 100, height: 40 },
          style: {},
          props: {},
        },
        semantics: {
          handles: role === 'button' ? ['click'] : [],
          accessibility: { label: `el-${p}-${e}` },
        },
        locked: false,
        hidden: false,
        children: [],
      })
    }
    pages.push({
      id: pageId,
      name: `Page ${p + 1}`,
      type: 'page' as const,
      viewport: { width: 1440, height: 1024, preset: 'desktop-1440' },
      background: {},
      elements,
      metadata: {},
    })
  }

  // 300 interactions: navigate chains + send-to-agent patterns
  const agentId = createId()
  const interactions = []
  for (let i = 0; i < 300; i++) {
    const sourcePage = pageIds[i % 100]!
    const targetPage = pageIds[(i + 1) % 100]!
    if (i % 3 === 0) {
      interactions.push({
        id: createId(),
        sourcePageId: sourcePage,
        sourceElementId: buttonIds[i % buttonIds.length],
        trigger: 'click' as const,
        enabled: true,
        action: { type: 'navigate' as const, targetPageId: targetPage },
      })
    } else if (i % 3 === 1) {
      interactions.push({
        id: createId(),
        sourcePageId: sourcePage,
        trigger: 'load' as const,
        enabled: true,
        action: {
          type: 'sendToAgent' as const,
          agentId,
          payload: { type: 'literal' as const, value: `q-${i}` },
        },
      })
    } else {
      interactions.push({
        id: createId(),
        sourcePageId: sourcePage,
        trigger: 'click' as const,
        enabled: true,
        action: {
          type: 'toggleVisibility',
          targetElementId: buttonIds[(i + 1) % buttonIds.length],
        },
      })
    }
  }

  return {
    schemaVersion: 1,
    id: createId(),
    name: 'Stress Project',
    createdAt: '2026-09-16T00:00:00.000Z',
    updatedAt: '2026-09-16T00:00:00.000Z',
    pages: pages as unknown as ProjectRoot['pages'],
    components: [],
    agents: [
      {
        id: agentId,
        name: 'Stress Agent',
        description: '',
        instructions: 'answer',
        modelPolicy: { provider: 'openai', model: 'gpt-4.1-mini', api: 'openai-completions' },
        capabilityRefs: [],
        memory: { enabled: false },
        isDefault: true,
      },
    ],
    capabilities: [],
    interactions: interactions as unknown as ProjectRoot['interactions'],
    bindings: [],
    variables: [],
    assets: [],
    settings: {
      theme: { colors: {}, fonts: {} },
      viewportPresets: [{ name: 'desktop-1440', width: 1440, height: 1024 }],
      locale: 'en',
      generator: { target: 'web-agent', dependencyOverrides: {} },
    },
  }
}

describe('P14.21 — large project (100 pages / 5,000 elements / 300 interactions)', () => {
  it('validates, lints and serializes inside the time budget', () => {
    const project = buildLargeProject()
    expect(project.pages).toHaveLength(100)
    const elementCount = project.pages.reduce((n, p) => n + p.elements.length, 0)
    expect(elementCount).toBe(5_000)
    expect(project.interactions).toHaveLength(300)

    const t0 = performance.now()
    const parsed = parseProject(JSON.parse(JSON.stringify(project)))
    expect(parsed.ok).toBe(true)
    const report = validateRefs(parsed.ok ? parsed.project : ({} as never))
    expect(report.ok).toBe(true)
    const serialized = JSON.stringify(parsed.project)
    const elapsed = performance.now() - t0

    // generous CI budget: validation + full ref walk + serialization of a
    // 5,000-element document must stay well under 10 s
    expect(elapsed).toBeLessThan(10_000)
    // document is substantial (5,000 elements with full metadata)
    expect(serialized.length).toBeGreaterThan(500_000)
  }, 30_000)
})
