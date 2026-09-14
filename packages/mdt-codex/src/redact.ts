/**
 * Secret redaction for logs and UI-bound events (tasklist P13.04).
 * One sanitizer shared by every MDT surface that renders or persists text
 * which may contain provider keys, tokens or auth headers.
 */
const SECRET_PATTERNS: RegExp[] = [
  /(authorization|api[-_]?key|apikey|access[-_]?token|refresh[-_]?token|client[-_]?secret|password|secret)["']?\s*[:=]\s*["']?[^\s"',;}]+/gi,
  /\b(sk|pk)-[A-Za-z0-9_-]{16,}/g,
  /\bghp_[A-Za-z0-9]{20,}\b/g,
  /\bgho_[A-Za-z0-9]{20,}\b/g,
  /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g,
  /\bxox[bap]-[A-Za-z0-9-]{10,}/g,
  /\bBearer\s+[A-Za-z0-9._/+=-]{8,}/gi,
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9._/-]+/g, // JWTs
]

const REPLACEMENT = '[redacted]'

export function redactText(text: string): string {
  let out = text
  for (const pattern of SECRET_PATTERNS)
    out = out.replace(pattern, (match) => match.slice(0, 4) + REPLACEMENT)
  return out
}
