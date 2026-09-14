/**
 * Capability bridge (tasklist P08.07, P11.10): turns project capability
 * instances + registry capabilities into runtime RegisteredTools. Only
 * capabilities the project actually assigns to an agent are registered —
 * unused capabilities are never packed into the generated app.
 */
import type { Capability, CapabilityContext } from '@mdt/capabilities'
import type { RegisteredTool } from './types'

export interface ToolBuildInput {
  capability: Capability
  /** secret values resolved for this instance (from the host secure store) */
  secrets: Record<string, string>
  /** granted permission scopes for this instance */
  granted: Set<string>
  sandboxRoots: readonly string[]
  workdir: string
  envAllowlist: readonly string[]
  askUser: import('@mdt/capabilities').CapabilityContext['askUser']
  log: (message: string) => void
}

export function buildRegisteredTool(input: ToolBuildInput): RegisteredTool {
  const { capability } = input
  return {
    name: capability.manifest.id,
    description: capability.manifest.description,
    parameters: capability.manifest.inputSchema as unknown as Record<string, unknown>,
    async execute(args, signal, onProgress) {
      const ctx: CapabilityContext = {
        secrets: input.secrets,
        granted: input.granted as CapabilityContext['granted'],
        sandboxRoots: input.sandboxRoots,
        workdir: input.workdir,
        envAllowlist: input.envAllowlist,
        signal,
        askUser: input.askUser,
        log: (message: string) => {
          input.log(`[${capability.manifest.id}] ${message}`)
          onProgress(message)
        },
      }
      const output = await capability.execute(args, ctx)
      return { content: output }
    },
  }
}
