import { describe, expect, it } from 'vitest'

import { sha256Hex } from './checkpoint-hash.js'

describe('sha256Hex', () => {
  it('produces the known sha256 hex digest for a fixed input', () => {
    expect(sha256Hex('hello world')).toBe(
      'b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9',
    )
  })

  it('is deterministic', () => {
    expect(sha256Hex('same input')).toBe(sha256Hex('same input'))
  })

  it('differs for different input', () => {
    expect(sha256Hex('a')).not.toBe(sha256Hex('b'))
  })
})
