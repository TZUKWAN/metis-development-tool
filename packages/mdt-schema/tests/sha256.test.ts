import { describe, expect, it } from 'vitest'

import { sha256Hex } from '../src/sha256'

describe('sha256Hex (FIPS-180 vectors)', () => {
  it('empty string', () => {
    expect(sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
  })

  it('"abc"', () => {
    expect(sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    )
  })

  it('448-bit message (two-block boundary)', () => {
    expect(sha256Hex('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq')).toBe(
      '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
    )
  })

  it('utf-8 multibyte input', () => {
    // echo -n <UTF-8 hello> | sha256sum
    expect(sha256Hex('你好')).toBe(
      '670d9743542cae3ea7ebe36af56bd53648b0a1126162e78d81a32934a711302e',
    )
  })

  it('matches node:crypto on a longer payload', async () => {
    const { createHash } = await import('node:crypto')
    const input = 'x'.repeat(10_000) + ' métis 🚀'
    expect(sha256Hex(input)).toBe(createHash('sha256').update(input).digest('hex'))
  })
})
