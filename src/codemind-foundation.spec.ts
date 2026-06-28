import { describe, expect, it } from 'vitest'

import {
  CODEMIND_AJNA_CAPABILITY_NAME,
  CODEMIND_PLATFORM_NAME,
  getCodemindFoundationSnapshot,
} from './codemind-foundation.js'

describe('CodeMind foundation snapshot', () => {
  it('identifies CodeMind as the platform and Ajna as a capability', () => {
    const snapshot = getCodemindFoundationSnapshot()

    expect(snapshot.platform).toBe(CODEMIND_PLATFORM_NAME)
    expect(snapshot.primaryCapability).toBe(CODEMIND_AJNA_CAPABILITY_NAME)
  })

  it('uses a direct execution runtime posture', () => {
    const snapshot = getCodemindFoundationSnapshot()

    expect(snapshot.posture).toEqual(['DIRECT_EXECUTION'])
  })

  it('enables core direct execution runtime surfaces', () => {
    const snapshot = getCodemindFoundationSnapshot()

    expect(snapshot.mutationEnabled).toBe(true)
    expect(snapshot.githubWriteEnabled).toBe(true)
    expect(snapshot.bashExecutionEnabled).toBe(true)
    expect(snapshot.networkIngestionEnabled).toBe(true)
  })
})
