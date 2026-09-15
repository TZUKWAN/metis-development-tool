/**
 * Tool approval bridge (tasklist P08.11).
 *
 * MDT never executes a capability tool the host has not approved. The Pi
 * Agent loop exposes a single seam — the `beforeToolCall` hook — which may
 * block a call before execution; a blocked call never reaches the tool and
 * the model instead receives an error tool result carrying the reason.
 *
 * This module owns the approval vocabulary:
 * - `ApprovalPolicy`: the static postures a generated app can ship with
 *   (`allow-all` / `deny-all` / `ask`).
 * - `ApprovalBridge`: the host-provided async decision point (e.g. an IPC
 *   round trip to the UI). `ask` maps onto it directly.
 * - `createApprovalHook`: adapts a bridge + per-tool scope map into the Pi
 *   `beforeToolCall` hook, racing the decision against the run's abort
 *   signal so a cancelled run never hangs on a pending approval.
 */
import type { BeforeToolCallContext, BeforeToolCallResult } from '@earendil-works/pi-agent-core'

/** Static approval postures (P08.11). */
export type ApprovalPolicy = 'allow-all' | 'deny-all' | 'ask'

/** What the host is asked to approve. */
export interface ApprovalRequest {
  toolName: string
  args: Record<string, unknown>
  /**
   * Permission scopes the tool would exercise (from
   * `@mdt/capabilities` PermissionScope: network | filesystem | process |
   * browser | user-interaction) so the UI can show meaningful consent copy.
   */
  scopes: string[]
}

export interface ApprovalDecision {
  approved: boolean
  /** shown to the model when the call is blocked */
  reason?: string
}

/** Host-side decision point — typically an IPC round trip to the UI. */
export interface ApprovalBridge {
  requestApproval(req: ApprovalRequest): Promise<ApprovalDecision>
}

export const DENY_ALL_REASON = 'tool execution is disabled by the deny-all approval policy'
export const NO_ASK_UI_REASON = 'tool execution denied: no approval UI is available for "ask"'

/**
 * Map a static policy onto the bridge shape. `ask` requires a bridge-like
 * decision callback (the UI); without one it fails closed.
 */
export function policyBridge(
  policy: ApprovalPolicy,
  ask?: (req: ApprovalRequest) => Promise<ApprovalDecision>,
): ApprovalBridge {
  switch (policy) {
    case 'allow-all':
      return { requestApproval: async () => ({ approved: true }) }
    case 'deny-all':
      return { requestApproval: async () => ({ approved: false, reason: DENY_ALL_REASON }) }
    case 'ask':
      return {
        requestApproval: ask ?? (async () => ({ approved: false, reason: NO_ASK_UI_REASON })),
      }
  }
}

function abortError(signal: AbortSignal): Error {
  const reason = (signal as { reason?: unknown }).reason
  if (reason instanceof Error) return reason
  return new DOMException('The operation was aborted', 'AbortError')
}

/**
 * Reject with an AbortError as soon as `signal` fires while `promise` is
 * pending (and when it was already aborted). The underlying bridge promise
 * may still settle later — its result is simply dropped; no unhandled
 * rejection escapes.
 */
export function raceAbort<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise
  if (signal.aborted) return Promise.reject(abortError(signal))
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(abortError(signal))
    signal.addEventListener('abort', onAbort, { once: true })
    promise.then(
      (value) => {
        signal.removeEventListener('abort', onAbort)
        resolve(value)
      },
      (err) => {
        signal.removeEventListener('abort', onAbort)
        reject(err)
      },
    )
  })
}

export interface ApprovalHookOptions {
  bridge: ApprovalBridge
  /** tool name → permission scopes it would exercise (missing tools: none) */
  scopesByTool: Map<string, string[]>
  /** reason used when the bridge denies without one */
  defaultDenyReason?: string
}

/**
 * Build the Pi `beforeToolCall` hook: consult the bridge before every tool
 * execution; a negative decision returns `{ block: true, reason }` so the
 * loop turns the call into an error tool result instead of running the
 * tool. A pending decision is raced against the run's abort signal.
 */
export function createApprovalHook(options: ApprovalHookOptions): (
  context: BeforeToolCallContext,
  signal?: AbortSignal,
) => Promise<BeforeToolCallResult | undefined> {
  const { bridge, scopesByTool, defaultDenyReason } = options
  return async (context, signal) => {
    const scopes = scopesByTool.get(context.toolCall.name) ?? []
    const decision = await raceAbort(
      bridge.requestApproval({
        toolName: context.toolCall.name,
        args: (context.args ?? {}) as Record<string, unknown>,
        scopes,
      }),
      signal,
    )
    if (decision.approved) return undefined
    return {
      block: true,
      reason:
        decision.reason ?? defaultDenyReason ?? `tool "${context.toolCall.name}" was not approved`,
    }
  }
}
