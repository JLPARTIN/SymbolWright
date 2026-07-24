import { describe, expect, it } from 'vitest'

import { detectAjnaArchitectureDrift } from './ajna-architecture-drift.js'
import { deriveAjnaMergeReadiness } from './ajna-merge-readiness.js'
import type { AjnaReviewRequest } from './ajna-review.types.js'

function makeRequest(overrides: Partial<AjnaReviewRequest> = {}): AjnaReviewRequest {
  return {
    requestId: 'ajna-req-1',
    subject: {
      repository: 'JLPARTIN/CodeMind',
      baseRef: 'main',
      headRef: 'feature',
    },
    changedFiles: [],
    requireCiEvidence: false,
    requireTestEvidence: false,
    ...overrides,
  }
}

describe('detectAjnaArchitectureDrift', () => {
  it('returns no findings for a small, single-module change with no policy', () => {
    const findings = detectAjnaArchitectureDrift({
      changedFiles: ['src/ajna/ajna-merge-readiness.ts', 'src/ajna/ajna-merge-readiness.spec.ts'],
    })
    expect(findings).toEqual([])
  })

  it('flags wide cross-module changes without requiring a policy', () => {
    const changedFiles = [
      'src/ajna/a.ts',
      'src/autonomy/b.ts',
      'src/portability/c.ts',
      'src/runtime/d.ts',
      'src/mission/e.ts',
      'src/web/f.ts',
    ]
    const findings = detectAjnaArchitectureDrift({ changedFiles })
    expect(findings).toHaveLength(1)
    expect(findings[0]).toMatchObject({
      id: 'ajna-architecture-drift-breadth',
      category: 'ARCHITECTURE_DRIFT',
      risk: 'MEDIUM',
      blocksMerge: false,
    })
  })

  it('respects a caller-supplied breadth threshold', () => {
    const changedFiles = ['src/ajna/a.ts', 'src/autonomy/b.ts', 'src/portability/c.ts']
    expect(detectAjnaArchitectureDrift({ changedFiles })).toEqual([])
    const findings = detectAjnaArchitectureDrift({
      changedFiles,
      policy: { maxTouchedModulesBeforeDrift: 2 },
    })
    expect(findings).toHaveLength(1)
  })

  it('does not check layering when no policy is supplied, even with import edges', () => {
    const findings = detectAjnaArchitectureDrift({
      changedFiles: ['src/portability/repository-portability.ts'],
      importEdges: [
        {
          importer: 'src/portability/repository-portability.ts',
          imported: 'src/ajna/ajna-review.types.ts',
        },
      ],
    })
    expect(findings).toEqual([])
  })

  it('flags a layering violation as HIGH and blocking when a policy forbids the import', () => {
    const findings = detectAjnaArchitectureDrift({
      changedFiles: ['src/portability/repository-portability.ts'],
      importEdges: [
        {
          importer: 'src/portability/repository-portability.ts',
          imported: 'src/ajna/ajna-review.types.ts',
        },
      ],
      policy: {
        layering: [{ from: 'portability', mustNotImport: ['ajna'] }],
      },
    })
    expect(findings).toHaveLength(1)
    expect(findings[0]).toMatchObject({
      id: 'ajna-architecture-drift-layering',
      category: 'ARCHITECTURE_DRIFT',
      risk: 'HIGH',
      blocksMerge: true,
    })
    expect(findings[0]!.affectedFiles).toEqual(['src/portability/repository-portability.ts'])
  })

  it('does not flag imports the layering policy permits', () => {
    const findings = detectAjnaArchitectureDrift({
      changedFiles: ['src/portability/repository-portability.ts'],
      importEdges: [
        { importer: 'src/portability/repository-portability.ts', imported: 'src/runtime/types.ts' },
      ],
      policy: {
        layering: [{ from: 'portability', mustNotImport: ['ajna'] }],
      },
    })
    expect(findings).toEqual([])
  })

  it('reports both a layering violation and a breadth signal together when both apply', () => {
    const changedFiles = [
      'src/portability/a.ts',
      'src/ajna/b.ts',
      'src/autonomy/c.ts',
      'src/runtime/d.ts',
      'src/mission/e.ts',
      'src/web/f.ts',
    ]
    const findings = detectAjnaArchitectureDrift({
      changedFiles,
      importEdges: [{ importer: 'src/portability/a.ts', imported: 'src/ajna/b.ts' }],
      policy: { layering: [{ from: 'portability', mustNotImport: ['ajna'] }] },
    })
    expect(findings.map((finding) => finding.id).sort()).toEqual([
      'ajna-architecture-drift-breadth',
      'ajna-architecture-drift-layering',
    ])
  })

  it('drives BLOCKED_BY_ARCHITECTURE_DRIFT merge readiness end to end for a layering violation', () => {
    const findings = detectAjnaArchitectureDrift({
      changedFiles: ['src/portability/repository-portability.ts'],
      importEdges: [
        {
          importer: 'src/portability/repository-portability.ts',
          imported: 'src/ajna/ajna-review.types.ts',
        },
      ],
      policy: { layering: [{ from: 'portability', mustNotImport: ['ajna'] }] },
    })
    const readiness = deriveAjnaMergeReadiness(
      makeRequest({ changedFiles: ['src/portability/repository-portability.ts'] }),
      findings,
    )
    expect(readiness.status).toBe('BLOCKED_BY_ARCHITECTURE_DRIFT')
    expect(readiness.operatorDecisionRequired).toBe(true)
  })

  it('does not block merge readiness for a breadth-only signal', () => {
    const changedFiles = [
      'src/ajna/a.ts',
      'src/autonomy/b.ts',
      'src/portability/c.ts',
      'src/runtime/d.ts',
      'src/mission/e.ts',
      'src/web/f.ts',
    ]
    const findings = detectAjnaArchitectureDrift({ changedFiles })
    const readiness = deriveAjnaMergeReadiness(makeRequest({ changedFiles }), findings)
    expect(readiness.status).toBe('READY_TO_REVIEW')
  })

  it('ignores changed files outside the src/<module>/ layout', () => {
    const findings = detectAjnaArchitectureDrift({
      changedFiles: ['README.md', 'package.json', '.github/workflows/ci.yml'],
    })
    expect(findings).toEqual([])
  })
})
