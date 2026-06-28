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

  it('uses a plan-first runtime posture', () => {
    const snapshot = getCodemindFoundationSnapshot()

    expect(snapshot.posture).toEqual(['PLAN_FIRST'])
  })

  it('keeps the core runtime surfaces disabled', () => {
    const snapshot = getCodemindFoundationSnapshot()

    expect(snapshot.mutationEnabled).toBe(false)
    expect(snapshot.githubWriteEnabled).toBe(false)
    expect(snapshot.bashExecutionEnabled).toBe(false)
    expect(snapshot.networkIngestionEnabled).toBe(false)
  })
})
