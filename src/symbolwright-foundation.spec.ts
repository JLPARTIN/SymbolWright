import { describe, expect, it } from 'vitest'

import {
  SYMBOLWRIGHT_AJNA_CAPABILITY_NAME,
  SYMBOLWRIGHT_PLATFORM_NAME,
  getSymbolWrightFoundationSnapshot,
} from './symbolwright-foundation.js'

describe('SymbolWright foundation snapshot', () => {
  it('identifies SymbolWright as the platform and Ajna as a capability', () => {
    const snapshot = getSymbolWrightFoundationSnapshot()

    expect(snapshot.platform).toBe(SYMBOLWRIGHT_PLATFORM_NAME)
    expect(snapshot.primaryCapability).toBe(SYMBOLWRIGHT_AJNA_CAPABILITY_NAME)
  })

  it('uses a direct execution runtime posture', () => {
    const snapshot = getSymbolWrightFoundationSnapshot()

    expect(snapshot.posture).toEqual(['DIRECT_EXECUTION'])
  })

  it('enables core direct execution runtime surfaces', () => {
    const snapshot = getSymbolWrightFoundationSnapshot()

    expect(snapshot.mutationEnabled).toBe(true)
    expect(snapshot.githubWriteEnabled).toBe(true)
    expect(snapshot.bashExecutionEnabled).toBe(true)
    expect(snapshot.networkIngestionEnabled).toBe(true)
  })
})
