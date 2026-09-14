/**
 * Stable identity for every MDT object (tasklist P04.12).
 *
 * IDs are UUIDv7: 48-bit big-endian Unix millisecond timestamp + 74 random
 * bits, version/variant fields per RFC 9562. Sortable by creation time, no
 * coordination needed, and — unlike array indices or names — they never
 * change when an object is moved, renamed or reordered.
 *
 * A per-process monotonic counter guarantees no collision for IDs generated
 * within the same millisecond (the 12-bit rand_b field is rewired as a
 * counter seeded from randomness), so 100k+ generations stay conflict-free.
 */
import { randomBytes } from 'node:crypto'

export const ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

let lastMs = 0
let counter = 0

function seedCounter(): number {
  return randomBytes(2).readUInt16BE(0) & 0x0fff
}

/** Generate a fresh UUIDv7 string. */
export function createId(): string {
  let ms = Date.now()
  if (ms === lastMs) {
    counter = (counter + 1) & 0x0fff
    if (counter === 0) {
      // counter exhausted within this millisecond — spin until the clock moves
      do {
        ms = Date.now()
      } while (ms === lastMs)
      counter = seedCounter()
    }
  } else {
    lastMs = ms
    counter = seedCounter()
  }
  const buf = Buffer.alloc(16)
  buf.writeUInt32BE(Math.floor(ms / 2 ** 16), 0)
  buf.writeUInt16BE(ms % 2 ** 16, 4)
  // version 7 + counter (rand_a per RFC 9562 may be counter or random; we use counter)
  buf[6] = 0x70 | (counter >> 8)
  buf[7] = counter & 0xff
  randomBytes(8).copy(buf, 8)
  buf[8] = (buf[8] & 0x3f) | 0x80 // variant 10
  const hex = buf.toString('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

/** True when `value` is a well-formed MDT id (UUIDv7). */
export function isId(value: unknown): value is string {
  return typeof value === 'string' && ID_PATTERN.test(value)
}
