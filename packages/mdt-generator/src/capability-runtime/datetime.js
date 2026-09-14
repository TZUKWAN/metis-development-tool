/**
 * Self-contained `datetime` capability for generated apps (generator-owned
 * runtime source; emitted verbatim into server/capabilities/datetime.js).
 * No external dependencies.
 */
const UNIT_MS = {
  seconds: 1_000,
  minutes: 60_000,
  hours: 3_600_000,
  days: 86_400_000,
}

function toMs(amount, unit) {
  const factor = UNIT_MS[unit]
  if (!factor) throw new Error(`unknown unit "${unit}"`)
  return amount * factor
}

function formatIn(date, timezone) {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      dateStyle: 'medium',
      timeStyle: 'long',
    }).format(date)
  } catch {
    throw new Error(`unknown timezone "${timezone}"`)
  }
}

export async function execute(input) {
  const op = String(input.operation)
  const tz = typeof input.timezone === 'string' ? input.timezone : 'UTC'
  switch (op) {
    case 'now': {
      const now = new Date()
      return { result: formatIn(now, tz), iso: now.toISOString(), timezone: tz }
    }
    case 'parse': {
      const d = new Date(String(input.value))
      if (Number.isNaN(d.getTime()))
        throw new Error(`cannot parse "${String(input.value)}" as a date`)
      return { result: formatIn(d, tz), iso: d.toISOString(), timezone: tz }
    }
    case 'add': {
      const d = new Date(String(input.value))
      if (Number.isNaN(d.getTime()))
        throw new Error(`cannot parse "${String(input.value)}" as a date`)
      const ms = toMs(Number(input.amount), String(input.unit ?? 'days'))
      if (!Number.isFinite(ms)) throw new Error('amount must be a finite number')
      const shifted = new Date(d.getTime() + ms)
      return { result: formatIn(shifted, tz), iso: shifted.toISOString(), timezone: tz }
    }
    case 'diff': {
      const a = new Date(String(input.value))
      const b = new Date(String(input.compare))
      if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) {
        throw new Error('diff needs two valid dates')
      }
      const seconds = (b.getTime() - a.getTime()) / 1000
      return { result: `${seconds}s`, iso: b.toISOString(), timezone: tz }
    }
    default:
      throw new Error(`unknown datetime operation "${op}"`)
  }
}
