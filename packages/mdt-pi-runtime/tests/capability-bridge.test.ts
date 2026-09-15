import { describe, expect, it } from 'vitest'

import {
  CapabilityManifestSchema,
  type Capability,
  type CapabilityContext,
} from '@mdt/capabilities'

import { buildRegisteredTool, type ToolBuildInput } from '../src/capability-bridge'
import type { RegisteredTool } from '../src/types'

const manifest = CapabilityManifestSchema.parse({
  id: 'test_echo',
  name: 'Test Echo',
  version: '1.0.0',
  category: 'data',
  description: 'Echoes structured input for bridge tests',
  inputSchema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
  outputSchema: { type: 'object', properties: {} },
  ui: { summary: 'echoes input' },
})

interface CapturedCtx {
  ctx: CapabilityContext
  args: Record<string, unknown>
}

/** Capability whose execute captures the ctx the bridge handed it. */
function capturingCapability(
  run: (ctx: CapabilityContext, args: Record<string, unknown>) => Promise<Record<string, unknown>>,
): { capability: Capability; captured: CapturedCtx[] } {
  const captured: CapturedCtx[] = []
  const capability: Capability = {
    manifest,
    async execute(args, ctx) {
      captured.push({ ctx, args })
      return run(ctx, args)
    },
  }
  return { capability, captured }
}

function bridgeInput(
  capability: Capability,
  overrides: Partial<ToolBuildInput> = {},
): ToolBuildInput {
  return {
    capability,
    secrets: { api_key: 'sk-super-secret' },
    granted: new Set(['network', 'filesystem'] as never),
    sandboxRoots: ['/workspace/project'],
    workdir: '/workspace/project',
    envAllowlist: ['PATH', 'HOME'],
    askUser: async (request) => ({ answered: true, value: request.question }),
    log: () => {},
    ...overrides,
  }
}

describe('buildRegisteredTool (P08.07, P11.10)', () => {
  it('projects the manifest onto the RegisteredTool surface', async () => {
    const { capability } = capturingCapability(async () => ({}))
    const tool: RegisteredTool = buildRegisteredTool(bridgeInput(capability))
    expect(tool.name).toBe('test_echo')
    expect(tool.description).toBe('Echoes structured input for bridge tests')
    expect(tool.parameters).toEqual(capability.manifest.inputSchema)
  })

  it('wires every CapabilityContext field the capability contract requires', async () => {
    let received: CapabilityContext | undefined
    let receivedArgs: Record<string, unknown> | undefined
    const { capability } = capturingCapability(async (ctx, args) => {
      received = ctx
      receivedArgs = args
      return { echoed: args.text }
    })
    const input = bridgeInput(capability)
    const tool = buildRegisteredTool(input)
    const controller = new AbortController()
    const result = await tool.execute({ text: 'hello' }, controller.signal, () => {})
    expect(result).toEqual({ content: { echoed: 'hello' } })
    // identity wiring — no copying, no dropping
    expect(receivedArgs).toEqual({ text: 'hello' })
    expect(received?.secrets).toEqual({ api_key: 'sk-super-secret' })
    expect(received?.granted).toBe(input.granted as never)
    expect(received?.sandboxRoots).toEqual(['/workspace/project'])
    expect(received?.workdir).toBe('/workspace/project')
    expect(received?.envAllowlist).toEqual(['PATH', 'HOME'])
    expect(received?.signal).toBe(controller.signal)
    expect(received?.askUser).toBe(input.askUser)
  })

  it('routes ctx.log through the host log with the capability id prefix AND onProgress', async () => {
    const hostLog: string[] = []
    const progressed: string[] = []
    const { capability } = capturingCapability(async (ctx) => {
      ctx.log('scanning workspace')
      return {}
    })
    const tool = buildRegisteredTool(bridgeInput(capability, { log: (m) => hostLog.push(m) }))
    await tool.execute({ text: 'x' }, new AbortController().signal, (m) => progressed.push(m))
    expect(hostLog).toEqual(['[test_echo] scanning workspace'])
    expect(progressed).toEqual(['scanning workspace'])
  })

  it('bridges askUser: the capability question reaches the host bridge', async () => {
    const asked: unknown[] = []
    const { capability } = capturingCapability(async (ctx) => {
      const answer = await ctx.askUser({ kind: 'confirm', question: 'Delete the file?' })
      return { answered: answer.answered, value: answer.value }
    })
    const tool = buildRegisteredTool(
      bridgeInput(capability, {
        askUser: async (request) => {
          asked.push(request)
          return { answered: true, value: true }
        },
      }),
    )
    const result = await tool.execute({ text: 'x' }, new AbortController().signal, () => {})
    expect(asked).toEqual([{ kind: 'confirm', question: 'Delete the file?' }])
    expect(result.content).toEqual({ answered: true, value: true })
  })

  it('propagates capability failures: a thrown error rejects the tool execute', async () => {
    const { capability } = capturingCapability(async () => {
      throw new Error('sandbox violation: outside workspace')
    })
    const tool = buildRegisteredTool(bridgeInput(capability))
    await expect(
      tool.execute({ text: 'x' }, new AbortController().signal, () => {}),
    ).rejects.toThrow('sandbox violation: outside workspace')
  })
})
