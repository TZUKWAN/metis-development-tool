/**
 * Codex availability + auth detection (tasklist P10.03, P10.04, P10.19).
 *
 * MDT never reads `~/.codex/auth.json`; auth state comes from
 * `codex login status` (or the protocol `account/read` once a session is
 * open). Only version/login STATE is surfaced — no credentials cross IPC.
 */
import { spawnSync } from 'node:child_process'

import { VERIFIED_VERSION_RANGE, type CodexAvailability } from './types'

export interface CodexBinary {
  /** resolved spawn target: the native binary on Windows, otherwise 'codex' */
  command: string
  argsPrefix: string[]
}

/** Resolve a spawnable codex command, working around the Windows .cmd shim
 * that Node refuses to spawn directly (EINVAL, CVE-2024-27980). */
export function resolveCodexBinary(explicitPath?: string): CodexBinary {
  if (explicitPath) return { command: explicitPath, argsPrefix: [] }
  if (process.platform === 'win32') {
    const candidates = [
      process.env.APPDATA
        ? `${process.env.APPDATA}\\npm\\node_modules\\@openai\\codex\\node_modules\\@openai\\codex-win32-x64\\vendor\\x86_64-pc-windows-msvc\\bin\\codex.exe`
        : undefined,
    ].filter((p): p is string => Boolean(p))
    for (const candidate of candidates) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        if (require('node:fs').existsSync(candidate)) return { command: candidate, argsPrefix: [] }
      } catch {
        // fall through to npm-package-relative resolution
      }
    }
  }
  return { command: 'codex', argsPrefix: [] }
}

function quickRun(args: string[]): { code: number | null; stdout: string } {
  const { command, argsPrefix } = resolveCodexBinary()
  try {
    const r = spawnSync(command, [...argsPrefix, ...args], { encoding: 'utf8', timeout: 15_000 })
    return { code: r.status, stdout: (r.stdout ?? '').trim() }
  } catch {
    return { code: null, stdout: '' }
  }
}

export function checkAvailability(): CodexAvailability {
  const versionRun = quickRun(['--version'])
  if (versionRun.code !== 0 || !versionRun.stdout) {
    return {
      installed: false,
      compatWarning:
        'Codex CLI not found. Install it with `npm install -g @openai/codex`, then run `codex login`.',
    }
  }
  const version = parseVersion(versionRun.stdout)
  const loginRun = quickRun(['login', 'status'])
  const availability: CodexAvailability = {
    installed: true,
    version,
    loggedIn: loginRun.code === 0,
  }
  if (version && !inVerifiedRange(version)) {
    availability.compatWarning = `Codex CLI ${version} is outside the MDT-verified range (${VERIFIED_VERSION_RANGE}); builds may misbehave.`
  }
  if (!availability.loggedIn) {
    availability.compatWarning = [
      availability.compatWarning,
      'Codex is not logged in — run `codex login` before building.',
    ]
      .filter(Boolean)
      .join(' ')
  }
  return availability
}

export function parseVersion(stdout: string): string | undefined {
  const m = /codex-cli\s+(\d+\.\d+\.\d+)/.exec(stdout) ?? /(\d+\.\d+\.\d+)/.exec(stdout)
  return m?.[1]
}

function inVerifiedRange(version: string): boolean {
  const [major, minor] = version.split('.').map(Number)
  const [minMajor, minMinor] = [0, 140]
  const [maxMajor, maxMinor] = [0, 200]
  const value = (major ?? 0) * 1_000_000 + (minor ?? 0) * 1_000
  return (
    value >= minMajor * 1_000_000 + minMinor * 1_000 &&
    value < maxMajor * 1_000_000 + maxMinor * 1_000
  )
}
