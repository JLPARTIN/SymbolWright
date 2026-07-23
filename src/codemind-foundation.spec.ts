import { describe, expect, it } from 'vitest'

import {
  CODEMIND_AJNA_CAPABILITY_NAME,
  CODEMIND_PLATFORM_NAME,
  CODETELLIGENCE_AJNA_CAPABILITY_NAME,
  CODETELLIGENCE_PLATFORM_NAME,
  getCodemindFoundationSnapshot,
  getCodetelligenceFoundationSnapshot,
} from './codemind-foundation.js'

describe('Codetelligence foundation snapshot', () => {
  it('identifies Codetelligence as the platform and Ajna as a capability', () => {
    const snapshot = getCodetelligenceFoundationSnapshot()

    expect(snapshot.platform).toBe(CODETELLIGENCE_PLATFORM_NAME)
    expect(snapshot.primaryCapability).toBe(CODETELLIGENCE_AJNA_CAPABILITY_NAME)
  })

  it('keeps legacy CodeMind exports as compatibility aliases', () => {
    expect(CODEMIND_PLATFORM_NAME).toBe(CODETELLIGENCE_PLATFORM_NAME)
    expect(CODEMIND_AJNA_CAPABILITY_NAME).toBe(CODETELLIGENCE_AJNA_CAPABILITY_NAME)
    expect(getCodemindFoundationSnapshot()).toEqual(getCodetelligenceFoundationSnapshot())
  })

  it('uses a direct execution runtime posture', () => {
    expect(getCodetelligenceFoundationSnapshot().posture).toEqual(['DIRECT_EXECUTION'])
  })

  it('enables core direct execution runtime surfaces', () => {
    const snapshot = getCodetelligenceFoundationSnapshot()

    expect(snapshot.mutationEnabled).toBe(true)
    expect(snapshot.githubWriteEnabled).toBe(true)
    expect(snapshot.bashExecutionEnabled).toBe(true)
    expect(snapshot.networkIngestionEnabled).toBe(true)
  })
})
