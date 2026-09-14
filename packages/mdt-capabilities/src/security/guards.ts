/**
 * URL guard: SSRF defense shared by web_fetch / http_request / browser
 * (tasklist P09.08, P13.07).
 *
 * Layers:
 *  1. scheme allowlist (http/https only; `javascript:`, `file:`, `data:` … die here)
 *  2. hostname blocklist before DNS (localhost variants, metadata endpoints)
 *  3. DNS resolution of the hostname and class checks on EVERY resolved
 *     address (IPv4 + IPv6), catching DNS-rebinding to private space
 *  4. explicit per-instance allowlist for local development (`localhostMode`)
 *
 * The guard is sync over pre-resolved addresses via `checkAddresses` so
 * adapters can re-verify after each redirect hop.
 */
import { promises as dnsPromises } from 'node:dns'
import { isIP } from 'node:net'

export class UrlBlockedError extends Error {
  readonly code = 'URL_BLOCKED'
  constructor(message: string) {
    super(message)
    this.name = 'UrlBlockedError'
  }
}

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'metadata.google.internal',
  'metadata.goog',
  'instance-data',
  'instance-data.ec2.internal',
])

function ipv4Blocked(ip: string): boolean {
  const [a, b] = ip.split('.').map(Number)
  if (a === 10 || a === 127 || a === 0) return true
  if (a === 169 && b === 254) return true // link-local incl. cloud metadata 169.254.169.254
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 192 && b === 168) return true
  if (a === 100 && b >= 64 && b <= 127) return true // CGNAT
  if (a >= 224) return true // multicast + reserved
  return false
}

function ipv6Blocked(ip: string): boolean {
  const addr = ip.toLowerCase()
  if (addr === '::1' || addr === '::') return true
  if (addr.startsWith('fe80')) return true // link-local
  if (addr.startsWith('fc') || addr.startsWith('fd')) return true // unique local
  if (addr.startsWith('ff')) return true // multicast
  // IPv4-mapped ::ffff:10.0.0.1
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(addr)
  if (mapped) return ipv4Blocked(mapped[1])
  return false
}

export function addressBlocked(ip: string): boolean {
  const family = isIP(ip)
  if (family === 4) return ipv4Blocked(ip)
  if (family === 6) return ipv6Blocked(ip)
  return true // unparsable → refuse
}

export interface UrlGuardOptions {
  /**
   * When true, loopback/private targets are allowed (local dev mode,
   * E2E fixtures). Must be an explicit per-instance opt-in — never a
   * project default (P13.07).
   */
  localhostMode?: boolean
}

/** True when `ip` is a loopback address (127.0.0.0/8, ::1, IPv4-mapped 127.0.0.1). */
export function isLoopbackAddress(ip: string): boolean {
  if (isIP(ip) === 4) return ip.startsWith('127.')
  const addr = ip.toLowerCase().split('%')[0]
  return addr === '::1' || addr === '::ffff:127.0.0.1' || addr.startsWith('::ffff:127.')
}

/** Strip brackets/zone index from a URL hostname and return it when it is a literal IP. */
function literalIp(hostname: string): string | null {
  const bare = hostname.startsWith('[') && hostname.endsWith(']') ? hostname.slice(1, -1) : hostname
  const noZone = bare.split('%')[0]
  return isIP(noZone) !== 0 ? noZone : null
}

function isLoopbackHostname(hostname: string): boolean {
  const bare = hostname.replace(/\.$/, '')
  return bare === 'localhost' || bare.endsWith('.localhost')
}

/**
 * Sync, pre-DNS guard (P09.08): scheme allowlist + hostname blocklist +
 * literal-IP class checks. No network is performed, so it is safe for
 * constructor-time and test use; every real request must additionally run
 * `assertUrlAllowedAsync` (which DNS-resolves and re-checks each address).
 */
export function assertUrlAllowed(rawUrl: string, options: UrlGuardOptions = {}): URL {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    throw new UrlBlockedError(`invalid url "${rawUrl}"`)
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new UrlBlockedError(`url scheme "${url.protocol}" is blocked — only http/https are allowed`)
  }
  const hostname = url.hostname.toLowerCase()
  const literal = literalIp(hostname)
  if (literal) {
    if (addressBlocked(literal) && !(options.localhostMode === true && isLoopbackAddress(literal))) {
      throw new UrlBlockedError(`url "${hostname}" points at a blocked address (${literal})`)
    }
    return url
  }
  if (isLoopbackHostname(hostname) && options.localhostMode !== true) {
    throw new UrlBlockedError(`host "${hostname}" is blocked — use localhostMode for local development`)
  }
  const bare = hostname.replace(/\.$/, '')
  if (BLOCKED_HOSTNAMES.has(bare)) {
    throw new UrlBlockedError(`host "${hostname}" is a blocked metadata/instance endpoint`)
  }
  return url
}

/**
 * Class-check every resolved address of `url` (DNS-rebinding defense: the
 * fetch layer re-runs this after each redirect hop).
 */
export function checkResolvedAddress(url: URL, addresses: readonly string[], options: UrlGuardOptions = {}): void {
  for (const address of addresses) {
    if (addressBlocked(address) && !(options.localhostMode === true && isLoopbackAddress(address))) {
      throw new UrlBlockedError(`url "${url.host}" resolves to a blocked address (${address})`)
    }
  }
}

/**
 * Full guard: sync checks, then DNS resolution of the hostname and class
 * checks on EVERY resolved address (IPv4 + IPv6). Note the resolved set is
 * not pinned into the socket (fetch re-resolves); the per-hop re-check plus
 * the response-size caps are the 1.0 mitigation for rebinding races.
 */
export async function assertUrlAllowedAsync(rawUrl: string, options: UrlGuardOptions = {}): Promise<URL> {
  const url = assertUrlAllowed(rawUrl, options)
  if (literalIp(url.hostname)) return url
  let resolved: { address: string; family: number }[]
  try {
    resolved = await dnsPromises.lookup(url.hostname.replace(/\.$/, ''), { all: true, verbatim: true })
  } catch {
    throw new UrlBlockedError(`cannot resolve host "${url.hostname}" — refusing to fetch`)
  }
  checkResolvedAddress(url, resolved.map((r) => r.address), options)
  return url
}
