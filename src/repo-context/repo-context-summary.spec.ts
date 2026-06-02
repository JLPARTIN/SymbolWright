import { describe, expect, it } from 'vitest'

import {
  countProtectedChangedFiles,
  getHighestRepoImpactLevel,
  hasRequiredEvidenceState,
  summarizeReadOnlyRepoContext,
} from './repo-context-summary.js'
import type {
  CodemindChangedFileContext,
  CodemindReadOnlyRepoContext,
} from './repo-context.types.js'

function makeChangedFile(
  overrides: Partial<CodemindChangedFileContext> = {},
): CodemindChangedFileContext {
  return {
    path: 'src/example.ts',
    changeType: 'MODIFIED',
    additions: 10,
    deletions: 2,
    impactLevel: 'LOW',
    protectedPath: false,
    notes: [],
    ...overrides,
  }
}

function makeContext(
  overrides: Partial<CodemindReadOnlyRepoContext> = {},
): CodemindReadOnlyRepoContext {
  return {
    repository: {
      owner: 'JLPARTIN',
      name: 'JLPARTIN-CodeMind',
      fullName: 'JLPARTIN/JLPARTIN-CodeMind',
      defaultBranch: 'main',
    },
    baseRef: { name: 'main' },
    headRef: { name: 'pr5-read-only-repo-context-model' },
    changedFiles: [],
    diffHunks: [],
    ciEvidence: [],
    testEvidence: [],
    contextGeneratedAt: '2026-05-28T00:00:00.000Z',
    readOnly: true,
    ...overrides,
  }
}

describe('read-only repo context summary', () => {
  it('counts protected changed files', () => {
    expect(
      countProtectedChangedFiles([
        makeChangedFile({ protectedPath: true }),
        makeChangedFile({ protectedPath: false }),
        makeChangedFile({ protectedPath: true }),
      ]),
    ).toBe(2)
  })

  it('finds the highest impact level', () => {
    expect(
      getHighestRepoImpactLevel([
        makeChangedFile({ impactLevel: 'LOW' }),
        makeChangedFile({ impactLevel: 'HIGH' }),
        makeChangedFile({ impactLevel: 'MEDIUM' }),
      ]),
    ).toBe('HIGH')
  })

  it('returns UNKNOWN impact for empty changed files', () => {
    expect(getHighestRepoImpactLevel([])).toBe('UNKNOWN')
  })

  it('requires evidence states to be present or not required', () => {
    expect(hasRequiredEvidenceState(['PRESENT', 'NOT_REQUIRED'])).toBe(true)
    expect(hasRequiredEvidenceState(['PRESENT', 'MISSING'])).toBe(false)
    expect(hasRequiredEvidenceState([])).toBe(false)
  })

  it('summarizes repository context without mutating it', () => {
    const context = makeContext({
      changedFiles: [
        makeChangedFile({ impactLevel: 'LOW' }),
        makeChangedFile({
          path: '.github/workflows/ci.yml',
          impactLevel: 'HIGH',
          protectedPath: true,
        }),
      ],
      ciEvidence: [
        {
          state: 'PRESENT',
          provider: 'github-actions',
          workflowName: 'CI',
          notes: [],
        },
      ],
      testEvidence: [
        {
          state: 'MISSING',
          command: 'npm test',
          framework: 'vitest',
          notes: ['Test evidence not available in this context.'],
        },
      ],
    })

    const summary = summarizeReadOnlyRepoContext(context)

    expect(summary).toEqual({
      repository: 'JLPARTIN/JLPARTIN-CodeMind',
      baseRef: 'main',
      headRef: 'pr5-read-only-repo-context-model',
      changedFileCount: 2,
      protectedChangedFileCount: 1,
      highestImpactLevel: 'HIGH',
      ciEvidenceSatisfied: true,
      testEvidenceSatisfied: false,
      readOnly: true,
    })
    expect(context.readOnly).toBe(true)
  })
})
