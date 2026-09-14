# Capability SDK (MDT 1.0)

Everything in MDT's registry — including all thirteen built-ins — is built
on the same small contract. A capability is:

1. a **manifest** (declarative metadata: id, version, input/output JSON
   Schema, permissions, secret slots, UI metadata), and
2. an **adapter** (`execute(input, ctx)`), a plain async function.

No base classes, no plugins loaded at runtime by the designer — the
registry just holds objects that satisfy the contract.

## Minimal example

```ts
import type { Capability } from '@mdt/capabilities'

export const coinFlipCapability: Capability = {
  manifest: {
    id: 'coin_flip',
    name: 'Coin Flip',
    version: '1.0.0',
    category: 'data',
    description: 'Flip a fair coin.',
    inputSchema: { type: 'object', properties: {}, required: [], additionalProperties: false },
    outputSchema: {
      type: 'object',
      properties: { result: { type: 'string', enum: ['heads', 'tails'] } },
      required: ['result'],
      additionalProperties: false,
    },
    permissions: [],
    secrets: [],
    ui: { icon: '🪙', summary: 'Flip a fair coin', keywords: ['coin'] },
  },
  async execute() {
    return { result: Math.random() < 0.5 ? 'heads' : 'tails' }
  },
}
```

Register it:

```ts
import { CapabilityRegistry, registerBuiltins } from '@mdt/capabilities'

const registry = registerBuiltins(new CapabilityRegistry())
registry.register(coinFlipCapability, { source: 'external' })
```

## The rules the harness enforces

Run the shared contract suite against your capability
(`import { runCapabilityContractTests } from '@mdt/capabilities/testing'`)
and it will verify:

- the manifest parses against the schema (semantic version, snake_case id,
  JSON-Schema-shaped input/output),
- outputs are JSON-safe,
- secret values never appear in outputs,
- invalid input throws a structured error (throw — never return error
  text as a result),
- an aborted `ctx.signal` never hangs the call.

## Context: what `execute` receives

`ctx` carries everything environment-specific, so adapters stay pure:

- `ctx.secrets` — resolved values for the slots your manifest declares.
  Treat them as write-only: never log, never echo.
- `ctx.granted` — the permission scopes the user granted. Call
  `requirePermission(ctx, capability, 'filesystem')` (throws a typed
  `PermissionDeniedError`) before touching a guarded resource.
- `ctx.sandboxRoots` / `ctx.workdir` — filesystem containment. Resolve all
  paths with `resolveInSandbox({ roots, workdir }, userPath)`; it
  canonicalizes and refuses traversal/symlink escapes.
- `ctx.signal` — cancellation. Check it between steps and pass it to
  fetch/subprocess calls.
- `ctx.envAllowlist` — the only environment variables a process capability
  may pass to children.
- `ctx.askUser` — pause and ask the user a question (text/confirm/select)
  with timeout/cancellation support.
- `ctx.log` — redacting logger. Never `console.log` from an adapter.

## Security expectations (reviewed at PR time)

- Network adapters must run targets through the URL guard
  (`assertUrlAllowedAsync`) **and re-validate every redirect hop**.
- Process adapters must spawn without a shell (`shell: false`), pass
  arguments as arrays, and restrict the environment to `ctx.envAllowlist`.
- Filesystem adapters must go through `resolveInSandbox` and enforce an
  output size cap.

## Packaging for projects

A project references a capability as an _instance_ (capabilityId + pinned
version + config + `${secret:NAME}` secret references + explicit
permission grants). Version policy: `^1.2.3` accepts newer 1.x; exact
pins accept only that version (see `isVersionCompatible` in the registry).
