import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, describe, expect, it } from 'vitest'

import {
  buildAjnaReviewPrForInput,
  parseAjnaReviewPrInput,
  renderAjnaReviewPrForFile,
} from './cli-ajna-review-pr.js'
import type { CodemindAjnaReviewPrInput } from './cli-ajna-review-pr.js'
import type { AjnaReviewFinding, AjnaReviewRequest } from './ajna/ajna-review.types.js'

const tempDirs: string[] = []

function makeRequest(overrides: Partial<AjnaReviewRequest> = {}): AjnaReviewRequest {
  return {
    requestId: 'cli-ajna-review-pr-1',
    subject: {
      repository: 'JLPARTIN/CodeMind',
      pullRequestNumber: 56,
      baseRef: 'main',
      headRef: 'ajna-review-pr-fixture-adapter',
    },
    changedFiles: ['src/example.ts'],
    requireCiEvidence: false,
    requireTestEvidence: false,
    ...overrides,
  }
}

function makeFinding(overrides: Partial<AjnaReviewFinding> = {}): AjnaReviewFinding {
  return {
    id: 'finding-1',
    category: 'DIFF_RISK',
    risk: 'LOW',
    title: 'Example finding',
    summary: 'Example finding summary.',
    evidence: [
      {
        evidenceClass: 'DIRECT_DIFF_EVIDENCE',
        summary: 'Example direct diff evidence.',
      },
    ],
    affectedFiles: ['src/example.ts'],
    recommendation: 'Review the finding.',
    blocksMerge: false,
    ...overrides,
  }
}

function makeInput(overrides: Partial<CodemindAjnaReviewPrInput> = {}): CodemindAjnaReviewPrInput {
  return {
    request: makeRequest(),
    findings: [],
    ...overrides,
  }
}

function writeInputFile(input: CodemindAjnaReviewPrInput): string {
  const rootDir = mkdtempSync(join(tmpdir(), 'codemind-ajna-review-pr-'))
  tempDirs.push(rootDir)
  const inputPath = join(rootDir, 'review-pr.json')
  writeFileSync(inputPath, JSON.stringify(input), 'utf-8')
  return inputPath
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
})

describe('buildAjnaReviewPrForInput', () => {
  it('builds a deterministic Ajna review report from local fixture input', () => {
    const result = buildAjnaReviewPrForInput(makeInput())

    expect(result.response.requestId).toBe('cli-ajna-review-pr-1')
    expect(result.response.tagline).toBe('See beyond the code.')
    expect(result.output).toContain('# Ajna Review Cortex Report')
    expect(result.output).toContain('- **Repository:** JLPARTIN/CodeMind')
    expect(result.output).toContain('- **Status:** READY_TO_REVIEW')
  })

  it('preserves changed files even when there are no findings', () => {
    const result = buildAjnaReviewPrForInput(makeInput())

    expect(result.response.changedFiles).toEqual(['src/example.ts'])
    expect(result.output).toContain('- src/example.ts')
  })

  it('preserves blocking findings in the rendered report', () => {
    const result = buildAjnaReviewPrForInput(
      makeInput({
        findings: [
          makeFinding({
            id: 'security-1',
            category: 'SECURITY_SENSITIVE_CHANGE',
            risk: 'CRITICAL',
            title: 'Security-sensitive change',
            blocksMerge: true,
          }),
        ],
      }),
    )

    expect(result.response.mergeReadiness.status).toBe('BLOCKED_BY_SECURITY')
    expect(result.output).toContain('Security-sensitive change')
    expect(result.output).toContain('- **Blocking finding IDs:** security-1')
  })

  it('uses an explicit recommended next action when provided', () => {
    const result = buildAjnaReviewPrForInput(
      makeInput({ recommendedNextAction: 'Operator should review the attached evidence.' }),
    )

    expect(result.output).toContain('Operator should review the attached evidence.')
  })
})

describe('parseAjnaReviewPrInput', () => {
  it('accepts request plus findings review-pr input', () => {
    const input = parseAjnaReviewPrInput(JSON.stringify(makeInput()))

    expect(input.request.requestId).toBe('cli-ajna-review-pr-1')
    expect(input.findings).toEqual([])
  })

  it('reuses Ajna merge-readiness JSON validation', () => {
    const request: Record<string, unknown> = { ...makeRequest() }
    delete request['requireCiEvidence']

    expect(() => parseAjnaReviewPrInput(JSON.stringify({ request, findings: [] }))).toThrow(
      'request.requireCiEvidence must be a boolean',
    )
  })

  it('rejects malformed finding records before rendering', () => {
    const finding = { ...makeFinding(), evidence: undefined }

    expect(() => parseAjnaReviewPrInput(JSON.stringify({ request: makeRequest(), findings: [finding] }))).toThrow(
      'findings[0].evidence must be an array',
    )
  })

  it('rejects malformed evidence records before rendering', () => {
    const finding = { ...makeFinding(), evidence: [{ evidenceClass: 'DIRECT_DIFF_EVIDENCE' }] }

    expect(() => parseAjnaReviewPrInput(JSON.stringify({ request: makeRequest(), findings: [finding] }))).toThrow(
      'findings[0].evidence[0].summary must be a non-empty string',
    )
  })

  it('rejects non-string recommended next actions', () => {
    expect(() =>
      parseAjnaReviewPrInput(
        JSON.stringify({ ...makeInput(), recommendedNextAction: { action: 'review' } }),
      ),
    ).toThrow('recommendedNextAction must be a string')
  })
})

describe('renderAjnaReviewPrForFile', () => {
  it('renders a file-backed Ajna review-pr report', () => {
    const output = renderAjnaReviewPrForFile(writeInputFile(makeInput()))

    expect(output).toContain('# Ajna Review Cortex Report')
    expect(output).toContain('## Merge-Readiness')
    expect(output).toContain('## Recommended Next Action')
  })
})
