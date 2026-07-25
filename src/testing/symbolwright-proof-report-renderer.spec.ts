import { describe, expect, it } from 'vitest'

import {
  renderSymbolWrightProofReport,
  SYMBOLWRIGHT_PROOF_REPORT_RENDERER_BLOCK_ID,
  SYMBOLWRIGHT_PROOF_REPORT_RENDERER_PHASE_ID,
  SYMBOLWRIGHT_PROOF_REPORT_RENDERER_PR_ID,
  type SymbolWrightProofReportBase,
} from './symbolwright-proof-report-renderer.js'

const READY_REPORT: SymbolWrightProofReportBase = {
  blockId: 'SYMBOLWRIGHT-PROOF-HARNESS-01',
  prId: 'PR-CM-TEST-01',
  phaseId: 'SYMBOLWRIGHT-TEST-01',
  status: 'COVERED',
  summary: '7/7 proof domains covered.',
  mutationAllowed: false,
  githubWriteAllowed: false,
  providerInvocationAllowed: false,
}

const PARTIAL_REPORT: SymbolWrightProofReportBase = {
  blockId: 'SYMBOLWRIGHT-PROOF-HARNESS-02',
  prId: 'PR-CM-TEST-02',
  phaseId: 'SYMBOLWRIGHT-TEST-02',
  status: 'TRACE_PROOF_PARTIAL',
  summary: '4/6 kernel trace blocks covered.',
  missingBlockIds: ['AGENT-KERNEL-05', 'AGENT-KERNEL-06'],
}

const BLOCKED_REPORT: SymbolWrightProofReportBase = {
  blockId: 'SYMBOLWRIGHT-PROOF-HARNESS-03',
  prId: 'PR-CM-TEST-03',
  phaseId: 'SYMBOLWRIGHT-TEST-03',
  status: 'AJNA_PROOF_BLOCKED',
  summary: 'Ajna proof matrix blocked: 1 blocking finding(s).',
  blockingNotes: ['Risk classification spec missing.'],
}

const INVALID_REPORT: SymbolWrightProofReportBase = {
  blockId: 'SYMBOLWRIGHT-PROOF-HARNESS-06',
  prId: 'PR-CM-TEST-06',
  phaseId: 'SYMBOLWRIGHT-TEST-06',
  status: 'RUNTIME_BOUNDARY_PROOF_INVALID',
  summary: 'Runtime boundary proof invalid: 1 flag violation(s).',
  flagViolations: ['providerInvocationAllowed must be false but is true.'],
}

describe('SymbolWright Proof Report Renderer', () => {
  it('emits canonical metadata and keeps mutation flags false', () => {
    const output = renderSymbolWrightProofReport({
      report: READY_REPORT,
      format: 'plain',
    })

    expect(output.blockId).toBe(SYMBOLWRIGHT_PROOF_REPORT_RENDERER_BLOCK_ID)
    expect(output.prId).toBe(SYMBOLWRIGHT_PROOF_REPORT_RENDERER_PR_ID)
    expect(output.phaseId).toBe(SYMBOLWRIGHT_PROOF_REPORT_RENDERER_PHASE_ID)
    expect(output.mutationAllowed).toBe(false)
    expect(output.githubWriteAllowed).toBe(false)
    expect(output.providerInvocationAllowed).toBe(false)
  })

  it('renders a ready report in plain format', () => {
    const output = renderSymbolWrightProofReport({
      report: READY_REPORT,
      format: 'plain',
    })

    expect(output.format).toBe('plain')
    expect(output.text).toContain('SYMBOLWRIGHT-PROOF-HARNESS-01')
    expect(output.text).toContain('PR-CM-TEST-01')
    expect(output.text).toContain('COVERED')
    expect(output.text).toContain('7/7 proof domains covered.')
    expect(output.text).toContain('npm test')
    expect(output.lineCount).toBeGreaterThan(0)
  })

  it('renders a partial report in plain format with missing items listed', () => {
    const output = renderSymbolWrightProofReport({
      report: PARTIAL_REPORT,
      format: 'plain',
    })

    expect(output.text).toContain('AGENT-KERNEL-05')
    expect(output.text).toContain('AGENT-KERNEL-06')
    expect(output.text).toContain('Issues:')
  })

  it('renders a blocked report in markdown format', () => {
    const output = renderSymbolWrightProofReport({
      report: BLOCKED_REPORT,
      format: 'markdown',
    })

    expect(output.format).toBe('markdown')
    expect(output.text).toContain('## SYMBOLWRIGHT-PROOF-HARNESS-03')
    expect(output.text).toContain('`AJNA_PROOF_BLOCKED`')
    expect(output.text).toContain('Risk classification spec missing.')
    expect(output.text).toContain('```bash')
  })

  it('renders an invalid report in compact format', () => {
    const output = renderSymbolWrightProofReport({
      report: INVALID_REPORT,
      format: 'compact',
    })

    expect(output.format).toBe('compact')
    expect(output.lineCount).toBe(1)
    expect(output.text).toContain('[RUNTIME_BOUNDARY_PROOF_INVALID]')
    expect(output.text).toContain('SYMBOLWRIGHT-PROOF-HARNESS-06')
  })

  it('includes timestamp only when renderedAt is supplied', () => {
    const withTs = renderSymbolWrightProofReport({
      report: READY_REPORT,
      format: 'plain',
      renderedAt: '2026-05-29T00:00:00.000Z',
    })
    const withoutTs = renderSymbolWrightProofReport({
      report: READY_REPORT,
      format: 'plain',
    })

    expect(withTs.text).toContain('2026-05-29T00:00:00.000Z')
    expect(withoutTs.text).not.toContain('Rendered:')
  })

  it('produces stable line order with no random IDs', () => {
    const input = { report: READY_REPORT, format: 'markdown' as const }
    const r1 = renderSymbolWrightProofReport(input)
    const r2 = renderSymbolWrightProofReport(input)

    expect(r1.text).toBe(r2.text)
    expect(r1.lineCount).toBe(r2.lineCount)
  })

  it('renders runtime invariants in plain format when present', () => {
    const output = renderSymbolWrightProofReport({
      report: READY_REPORT,
      format: 'plain',
    })

    expect(output.text).toContain('Runtime invariants:')
    expect(output.text).toContain('mutationAllowed: false')
    expect(output.text).toContain('githubWriteAllowed: false')
    expect(output.text).toContain('providerInvocationAllowed: false')
  })
})
