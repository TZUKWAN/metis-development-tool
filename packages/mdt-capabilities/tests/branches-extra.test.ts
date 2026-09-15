import { describe, expect, it } from 'vitest'

import { createCapabilityContext } from '../src/context'
import { askUserCapability } from '../src/capabilities/ask-user'
import { datetimeCapability } from '../src/capabilities/datetime'
import { assertUrlAllowedAsync, UrlBlockedError } from '../src/security/guards'
import { resolveInSandbox, PathEscapeError } from '../src/security/paths'

describe('ask_user remaining branches', () => {
  it('times out when the bridge never answers (timeoutMs)', async () => {
    const ctx = createCapabilityContext({
      askUser: () => new Promise(() => {}), // never answers
    })
    await expect(
      askUserCapability.execute({ kind: 'confirm', question: 'continue?', timeoutMs: 100 }, ctx),
    ).rejects.toThrow(/timed out after 100ms/)
  })

  it('rejects select questions with an empty options array', async () => {
    await expect(
      askUserCapability.execute(
        { kind: 'select', question: 'pick', options: [] },
        createCapabilityContext(),
      ),
    ).rejects.toThrow(/options/)
  })

  it('rejects empty questions', async () => {
    await expect(
      askUserCapability.execute({ kind: 'text', question: '' }, createCapabilityContext()),
    ).rejects.toThrow(/must not be empty/)
  })
})

describe('datetime remaining branches', () => {
  const ctx = createCapabilityContext()
  it('rejects unknown operations and units', async () => {
    await expect(datetimeCapability.execute({ operation: 'teleport' }, ctx)).rejects.toThrow(
      /unknown datetime operation/,
    )
    await expect(
      datetimeCapability.execute(
        { operation: 'add', value: '2026-01-01T00:00:00Z', amount: 1, unit: 'fortnights' },
        ctx,
      ),
    ).rejects.toThrow(/unknown unit/)
  })
  it('rejects non-finite amounts', async () => {
    await expect(
      datetimeCapability.execute(
        { operation: 'add', value: '2026-01-01T00:00:00Z', amount: 'lots', unit: 'days' },
        ctx,
      ),
    ).rejects.toThrow(/finite number/)
  })
})

describe('guards async DNS resolution branches', () => {
  it('throws a clear error for hosts that do not resolve', async () => {
    await expect(
      assertUrlAllowedAsync('http://definitely-not-a-real-host-mdt.invalid/', {}),
    ).rejects.toThrow(UrlBlockedError)
  })

  it('resolves and allows public DNS-backed hosts (example.com)', async () => {
    // uses the network's DNS only; no HTTP request is made
    const url = await assertUrlAllowedAsync('http://example.com/')
    expect(url.hostname).toBe('example.com')
  })
})

describe('resolveInSandbox remaining branches', () => {
  const roots = [process.platform === 'win32' ? 'C:\\absent-root-mdt' : '/absent-root-mdt']
  it('rejects empty and NUL paths', () => {
    expect(() => resolveInSandbox({ roots }, '')).toThrow(PathEscapeError)
    expect(() => resolveInSandbox({ roots }, 'a\0b')).toThrow(PathEscapeError)
  })
})
