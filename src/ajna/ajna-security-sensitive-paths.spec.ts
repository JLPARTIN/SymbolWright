import { describe, expect, it } from 'vitest'

import { detectAjnaSecuritySensitivePaths } from './ajna-security-sensitive-paths.js'
import { deriveAjnaMergeReadiness } from './ajna-merge-readiness.js'
import type { AjnaReviewRequest } from './ajna-review.types.js'

function makeRequest(overrides: Partial<AjnaReviewRequest> = {}): AjnaReviewRequest {
  return {
    requestId: 'ajna-req-1',
    subject: {
      repository: 'JLPARTIN/SymbolWright',
      baseRef: 'main',
      headRef: 'feature',
    },
    changedFiles: [],
    requireCiEvidence: false,
    requireTestEvidence: false,
    ...overrides,
  }
}

describe('detectAjnaSecuritySensitivePaths', () => {
  it('returns no findings for ordinary source paths', () => {
    const findings = detectAjnaSecuritySensitivePaths([
      'src/mission/mission-events.ts',
      'README.md',
    ])
    expect(findings).toEqual([])
  })

  it('flags secrets/credentials/crypto paths as CRITICAL and blocking', () => {
    const findings = detectAjnaSecuritySensitivePaths([
      '.env.production',
      'src/security/credentials-store.ts',
      'certs/server.pem',
    ])
    expect(findings).toHaveLength(1)
    expect(findings[0]).toMatchObject({
      category: 'SECURITY_SENSITIVE_CHANGE',
      risk: 'CRITICAL',
      blocksMerge: true,
    })
    expect(findings[0]!.affectedFiles).toEqual([
      '.env.production',
      'certs/server.pem',
      'src/security/credentials-store.ts',
    ])
  })

  it('flags auth/access-control paths as HIGH and blocking', () => {
    const findings = detectAjnaSecuritySensitivePaths([
      'src/runtime/auth/session-manager.ts',
      'src/runtime/validation/validation-command-gate.ts',
    ])
    expect(findings).toHaveLength(1)
    expect(findings[0]).toMatchObject({
      category: 'SECURITY_SENSITIVE_CHANGE',
      risk: 'HIGH',
      blocksMerge: true,
    })
  })

  it('flags supply-chain paths as MEDIUM and non-blocking', () => {
    const findings = detectAjnaSecuritySensitivePaths([
      '.github/workflows/ci.yml',
      'package-lock.json',
    ])
    expect(findings).toHaveLength(1)
    expect(findings[0]).toMatchObject({
      category: 'SECURITY_SENSITIVE_CHANGE',
      risk: 'MEDIUM',
      blocksMerge: false,
    })
  })

  it('produces one finding per matched tier when multiple tiers are touched', () => {
    const findings = detectAjnaSecuritySensitivePaths(['.env', 'src/auth/login.ts', 'Dockerfile'])
    expect(findings.map((finding) => finding.id).sort()).toEqual([
      'ajna-security-sensitive-auth-and-access-control',
      'ajna-security-sensitive-secrets-and-crypto',
      'ajna-security-sensitive-supply-chain',
    ])
  })

  it('matches each file to only its highest-specificity tier once', () => {
    const findings = detectAjnaSecuritySensitivePaths(['src/auth/jwt-session.ts'])
    const totalMatchedFiles = findings.flatMap((finding) => finding.affectedFiles)
    expect(totalMatchedFiles).toEqual(['src/auth/jwt-session.ts'])
  })

  it('drives BLOCKED_BY_SECURITY merge readiness end to end for a blocking tier', () => {
    const findings = detectAjnaSecuritySensitivePaths(['src/auth/session-manager.ts'])
    const readiness = deriveAjnaMergeReadiness(
      makeRequest({ changedFiles: ['src/auth/session-manager.ts'] }),
      findings,
    )
    expect(readiness.status).toBe('BLOCKED_BY_SECURITY')
    expect(readiness.operatorDecisionRequired).toBe(true)
  })

  it('does not block merge readiness for supply-chain-only changes', () => {
    const findings = detectAjnaSecuritySensitivePaths(['package-lock.json'])
    const readiness = deriveAjnaMergeReadiness(
      makeRequest({ changedFiles: ['package-lock.json'] }),
      findings,
    )
    expect(readiness.status).toBe('READY_TO_REVIEW')
  })

  it('supports a caller-supplied policy instead of the default rule set', () => {
    const findings = detectAjnaSecuritySensitivePaths(['src/widgets/color-picker.ts'], {
      rules: [
        {
          tier: 'auth-and-access-control',
          pattern: /widgets/,
          label: 'custom widget policy',
        },
      ],
    })
    expect(findings).toHaveLength(1)
    expect(findings[0]!.evidence[0]!.summary).toContain('custom widget policy')
  })
})
