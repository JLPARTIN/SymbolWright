import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, describe, expect, it } from 'vitest'

import {
  buildAjnaMergeReadinessForInput,
  parseAjnaMergeReadinessInput,
  renderAjnaMergeReadinessForFile,
} from './cli-ajna-merge-readiness.js'
import type { SymbolWrightAjnaMergeReadinessInput } from './cli-ajna-merge-readiness.js'
import type { AjnaReviewFinding, AjnaReviewRequest } from './ajna/ajna-review.types.js'

const tempDirs: string[] = []

function makeRequest(overrides: Partial<AjnaReviewRequest> = {}): AjnaReviewRequest {
  return {
    requestId: 'cli-ajna-readiness-1',
    subject: {
      repository: 'JLPARTIN/SymbolWright',
      pullRequestNumber: 54,
      baseRef: 'main',
      headRef: 'feat-ajna-merge-readiness-cli',
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

function makeInput(
  overrides: Partial<SymbolWrightAjnaMergeReadinessInput> = {},
): SymbolWrightAjnaMergeReadinessInput {
  return {
    request: makeRequest(),
    findings: [],
    ...overrides,
  }
}

function writeInputFile(input: SymbolWrightAjnaMergeReadinessInput): string {
  const rootDir = mkdtempSync(join(tmpdir(), 'symbolwright-ajna-merge-readiness-'))
  tempDirs.push(rootDir)
  const inputPath = join(rootDir, 'readiness.json')
  writeFileSync(inputPath, JSON.stringify(input), 'utf-8')
  return inputPath
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
})

describe('buildAjnaMergeReadinessForInput', () => {
  it('derives deterministic readiness from fixture-style CLI input', () => {
    const result = buildAjnaMergeReadinessForInput(makeInput())

    expect(result.readiness.status).toBe('READY_TO_REVIEW')
    expect(result.output).toContain('Ajna merge-readiness')
    expect(result.output).toContain('Status: READY_TO_REVIEW')
    expect(result.output).toContain('READ_ONLY')
  })

  it('preserves blocking Ajna findings from the merge-readiness engine', () => {
    const result = buildAjnaMergeReadinessForInput(
      makeInput({
        findings: [
          makeFinding({
            id: 'security-1',
            category: 'SECURITY_SENSITIVE_CHANGE',
            risk: 'CRITICAL',
            blocksMerge: true,
          }),
        ],
      }),
    )

    expect(result.readiness.status).toBe('BLOCKED_BY_SECURITY')
    expect(result.output).toContain('security-1')
  })
})

describe('parseAjnaMergeReadinessInput', () => {
  it('accepts request plus findings input', () => {
    const input = parseAjnaMergeReadinessInput(JSON.stringify(makeInput()))

    expect(input.request.requestId).toBe('cli-ajna-readiness-1')
    expect(input.findings).toEqual([])
  })

  it('rejects missing findings arrays', () => {
    expect(() => parseAjnaMergeReadinessInput(JSON.stringify({ request: makeRequest() }))).toThrow(
      'findings array',
    )
  })

  it('rejects missing requireCiEvidence fields', () => {
    const request: Record<string, unknown> = { ...makeRequest() }
    delete request['requireCiEvidence']

    expect(() => parseAjnaMergeReadinessInput(JSON.stringify({ request, findings: [] }))).toThrow(
      'request.requireCiEvidence must be a boolean',
    )
  })

  it('rejects missing requireTestEvidence fields', () => {
    const request: Record<string, unknown> = { ...makeRequest() }
    delete request['requireTestEvidence']

    expect(() => parseAjnaMergeReadinessInput(JSON.stringify({ request, findings: [] }))).toThrow(
      'request.requireTestEvidence must be a boolean',
    )
  })

  it('rejects malformed request subjects', () => {
    const request: Record<string, unknown> = {
      ...makeRequest(),
      subject: { repository: 'JLPARTIN/SymbolWright' },
    }

    expect(() => parseAjnaMergeReadinessInput(JSON.stringify({ request, findings: [] }))).toThrow(
      'request.subject.baseRef must be a non-empty string',
    )
  })
})

describe('renderAjnaMergeReadinessForFile', () => {
  it('renders read-only merge-readiness output from a JSON file', () => {
    const output = renderAjnaMergeReadinessForFile(writeInputFile(makeInput()))

    expect(output).toContain('Ajna merge-readiness')
    expect(output).toContain('Status: READY_TO_REVIEW')
    expect(output).toContain('Mode: READ_ONLY')
  })
})
