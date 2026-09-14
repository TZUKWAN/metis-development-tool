/** `datetime` capability (tasklist P09.18) — no external dependencies. */
import type { Capability } from '../manifest'

export const datetimeCapability: Capability = {
  manifest: {
    id: 'datetime',
    name: 'Date & Time',
    version: '1.0.0',
    category: 'data',
    description: 'Current time, timezone conversion and basic date arithmetic.',
    inputSchema: {
      type: 'object',
      properties: {
        operation: {
          type: 'string',
          enum: ['now', 'parse', 'add', 'diff'],
          description: 'now | parse | add | diff',
        },
        value: { type: 'string', description: 'ISO-8601 input for parse/add/diff' },
        amount: { type: 'number', description: 'units for add (may be negative)' },
        unit: {
          type: 'string',
          enum: ['seconds', 'minutes', 'hours', 'days'],
          description: 'unit for add',
        },
        timezone: { type: 'string', description: 'IANA timezone, e.g. Asia/Shanghai' },
        compare: { type: 'string', description: 'second ISO-8601 instant for diff' },
      },
      required: ['operation'],
      additionalProperties: false,
    },
    outputSchema: {
      type: 'object',
      properties: {
        result: { type: 'string' },
        iso: { type: 'string' },
        timezone: { type: 'string' },
      },
      required: ['result'],
      additionalProperties: false,
    },
    permissions: [],
    secrets: [],
    ui: {
      icon: '🕒',
      accent: '#5b8def',
      summary: 'Current time, parsing and date arithmetic',
      keywords: ['time', 'date', 'timezone', 'clock'],
      doc: 'datetime',
    },
    timeoutMs: 30_000,
    maxOutputBytes: 1_000_000,
  },
  async execute(input) {
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
        if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime()))
          throw new Error('diff needs two valid dates')
        const seconds = (b.getTime() - a.getTime()) / 1000
        return { result: `${seconds}s`, iso: b.toISOString(), timezone: tz }
      }
      default:
        throw new Error(`unknown datetime operation "${op}"`)
    }
  },
}

const UNIT_MS: Record<string, number> = {
  seconds: 1_000,
  minutes: 60_000,
  hours: 3_600_000,
  days: 86_400_000,
}

function toMs(amount: number, unit: string): number {
  const factor = UNIT_MS[unit]
  if (!factor) throw new Error(`unknown unit "${unit}"`)
  return amount * factor
}

function formatIn(date: Date, timezone: string): string {
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
