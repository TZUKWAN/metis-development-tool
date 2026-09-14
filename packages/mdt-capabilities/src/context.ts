/**
 * CapabilityContext factory (used by the generated-app runtime, MDT tests
 * and the E2E fixtures). Keeps secret redaction and permission gating in
 * one place (P13.04, P13.06).
 */
import type { PermissionScope } from './manifest'
import type { AskUserAnswer, AskUserRequest, Capability, CapabilityContext } from './manifest'

export interface ContextOverrides {
  secrets?: Record<string, string>
  granted?: Iterable<PermissionScope>
  sandboxRoots?: string[]
  workdir?: string
  envAllowlist?: string[]
  signal?: AbortSignal
  askUser?: (request: AskUserRequest) => Promise<AskUserAnswer>
  log?: (message: string) => void
}

export const REDACTED = '[redacted]'

/** Mask anything that looks like a credential in log output (P13.04). */
export function redact(message: string): string {
  return message
    .replace(/(authorization|api[-_]?key|token|secret|x-api-key|password)="?[\w./+=-]+"?/gi, '$1=[redacted]')
    .replace(/\b(sk|pk|ghp|gho|github_pat|xoxb|xoxp)-[\w-]{8,}/g, REDACTED)
    .replace(/\bBearer\s+[\w./+=-]+/gi, 'Bearer [redacted]')
}

export function createCapabilityContext(overrides: ContextOverrides = {}): CapabilityContext {
  return {
    secrets: overrides.secrets ?? {},
    granted: new Set(overrides.granted ?? []),
    sandboxRoots: overrides.sandboxRoots ?? [],
    workdir: overrides.workdir ?? process.cwd(),
    envAllowlist: overrides.envAllowlist ?? ['PATH', 'LANG', 'TZ'],
    signal: overrides.signal ?? new AbortController().signal,
    askUser:
      overrides.askUser ??
      (async () => ({ answered: false }) satisfies AskUserAnswer),
    log: overrides.log ?? (() => {}),
  }
}

/**
 * Permission gate (P13.06): every adapter must call this before touching a
 * scoped resource. Denied calls throw a typed error the runtime maps onto
 * the tool-error contract.
 */
export class PermissionDeniedError extends Error {
  readonly code = 'PERMISSION_DENIED'
  constructor(scope: PermissionScope, capabilityId: string) {
    super(`capability "${capabilityId}" requires ${scope} permission, which is not granted in this project`)
    this.name = 'PermissionDeniedError'
  }
}

export function requirePermission(ctx: CapabilityContext, capability: Capability, scope: PermissionScope): void {
  if (!ctx.granted.has(scope)) {
    throw new PermissionDeniedError(scope, capability.manifest.id)
  }
}
