import { describe, expect, it } from 'vitest'

import {
  buildSymbolWrightAjnaProofMatrixReport,
  SYMBOLWRIGHT_AJNA_PROOF_MATRIX_BLOCK_ID,
  SYMBOLWRIGHT_AJNA_PROOF_MATRIX_PHASE_ID,
  SYMBOLWRIGHT_AJNA_PROOF_MATRIX_PR_ID,
} from './symbolwright-ajna-proof-matrix.js'

describe('SymbolWright Ajna Proof Matrix', () => {
  it('emits canonical metadata and keeps mutation flags false', () => {
    const report = buildSymbolWrightAjnaProofMatrixReport({
      ajnaSpecFiles: ['src/ajna/ajna-merge-readiness.spec.ts'],
      requiredSpecFiles: ['src/ajna/ajna-merge-readiness.spec.ts'],
    })

    expect(report.blockId).toBe(SYMBOLWRIGHT_AJNA_PROOF_MATRIX_BLOCK_ID)
    expect(report.prId).toBe(SYMBOLWRIGHT_AJNA_PROOF_MATRIX_PR_ID)
    expect(report.phaseId).toBe(SYMBOLWRIGHT_AJNA_PROOF_MATRIX_PHASE_ID)
    expect(report.mutationAllowed).toBe(false)
    expect(report.githubWriteAllowed).toBe(false)
    expect(report.providerInvocationAllowed).toBe(false)
  })

  it('returns AJNA_PROOF_READY and allows merge when all required specs exist', () => {
    const report = buildSymbolWrightAjnaProofMatrixReport({
      ajnaSpecFiles: [
        'src/ajna/ajna-merge-readiness.spec.ts',
        'src/ajna/ajna-review-renderer.spec.ts',
      ],
      requiredSpecFiles: [
        'src/ajna/ajna-merge-readiness.spec.ts',
        'src/ajna/ajna-review-renderer.spec.ts',
      ],
    })

    expect(report.status).toBe('AJNA_PROOF_READY')
    expect(report.ajnaCanDeclareMergeReady).toBe(true)
    expect(report.missingSpecs).toEqual([])
    expect(report.summary).toContain('2/2')
  })

  it('returns AJNA_PROOF_PARTIAL when some required specs are missing', () => {
    const report = buildSymbolWrightAjnaProofMatrixReport({
      ajnaSpecFiles: ['src/ajna/ajna-merge-readiness.spec.ts'],
      requiredSpecFiles: [
        'src/ajna/ajna-merge-readiness.spec.ts',
        'src/ajna/ajna-review-renderer.spec.ts',
      ],
    })

    expect(report.status).toBe('AJNA_PROOF_PARTIAL')
    expect(report.ajnaCanDeclareMergeReady).toBe(false)
    expect(report.missingSpecs).toEqual(['src/ajna/ajna-review-renderer.spec.ts'])
    expect(report.summary).toContain('1/2')
  })

  it('returns AJNA_PROOF_BLOCKED when blocking findings are present', () => {
    const report = buildSymbolWrightAjnaProofMatrixReport({
      ajnaSpecFiles: [
        'src/ajna/ajna-merge-readiness.spec.ts',
        'src/ajna/ajna-review-renderer.spec.ts',
      ],
      requiredSpecFiles: [
        'src/ajna/ajna-merge-readiness.spec.ts',
        'src/ajna/ajna-review-renderer.spec.ts',
      ],
      blockingFindings: ['Risk classification spec missing for HIGH severity.'],
    })

    expect(report.status).toBe('AJNA_PROOF_BLOCKED')
    expect(report.ajnaCanDeclareMergeReady).toBe(false)
    expect(report.blockingFindings).toEqual(['Risk classification spec missing for HIGH severity.'])
    expect(report.summary).toContain('blocked')
  })

  it('returns AJNA_PROOF_BLOCKED when kernel trace proof is TRACE_PROOF_BLOCKED', () => {
    const report = buildSymbolWrightAjnaProofMatrixReport({
      ajnaSpecFiles: ['src/ajna/ajna-merge-readiness.spec.ts'],
      requiredSpecFiles: ['src/ajna/ajna-merge-readiness.spec.ts'],
      kernelTraceProofStatus: 'TRACE_PROOF_BLOCKED',
    })

    expect(report.status).toBe('AJNA_PROOF_BLOCKED')
    expect(report.ajnaCanDeclareMergeReady).toBe(false)
  })

  it('returns AJNA_PROOF_INVALID when kernel trace proof is TRACE_PROOF_INVALID', () => {
    const report = buildSymbolWrightAjnaProofMatrixReport({
      ajnaSpecFiles: [
        'src/ajna/ajna-merge-readiness.spec.ts',
        'src/ajna/ajna-review-renderer.spec.ts',
      ],
      requiredSpecFiles: [
        'src/ajna/ajna-merge-readiness.spec.ts',
        'src/ajna/ajna-review-renderer.spec.ts',
      ],
      kernelTraceProofStatus: 'TRACE_PROOF_INVALID',
    })

    expect(report.status).toBe('AJNA_PROOF_INVALID')
    expect(report.ajnaCanDeclareMergeReady).toBe(false)
    expect(report.summary).toContain('invalid')
  })

  it('sorts and deduplicates required spec paths deterministically', () => {
    const report = buildSymbolWrightAjnaProofMatrixReport({
      ajnaSpecFiles: [
        'src/ajna/ajna-review-renderer.spec.ts',
        'src/ajna/ajna-merge-readiness.spec.ts',
        'src/ajna/ajna-merge-readiness.spec.ts',
      ],
      requiredSpecFiles: [
        'src/ajna/ajna-review-renderer.spec.ts',
        'src/ajna/ajna-merge-readiness.spec.ts',
        'src/ajna/ajna-merge-readiness.spec.ts',
      ],
    })

    expect(report.coveredSpecs).toEqual([
      'src/ajna/ajna-merge-readiness.spec.ts',
      'src/ajna/ajna-review-renderer.spec.ts',
    ])
    expect(report.missingSpecs).toEqual([])
    expect(report.status).toBe('AJNA_PROOF_READY')
  })

  it('produces stable output across identical calls', () => {
    const input = {
      ajnaSpecFiles: ['src/ajna/ajna-merge-readiness.spec.ts'],
      requiredSpecFiles: [
        'src/ajna/ajna-merge-readiness.spec.ts',
        'src/ajna/ajna-review-renderer.spec.ts',
      ],
    }
    const r1 = buildSymbolWrightAjnaProofMatrixReport(input)
    const r2 = buildSymbolWrightAjnaProofMatrixReport(input)

    expect(r1.summary).toBe(r2.summary)
    expect(r1.status).toBe(r2.status)
    expect(r1.missingSpecs).toEqual(r2.missingSpecs)
  })
})
