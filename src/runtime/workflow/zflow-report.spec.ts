import { describe, expect, it } from 'vitest'

import type { ZflowHandoffPacket } from './zflow-handoff.js'
import type { ZflowResult } from './zflow-workflow.js'
import {
  createZflowExecutionReport,
  createZflowReportSnapshot,
  renderZflowReportJson,
  renderZflowReportMarkdown,
} from './zflow-report.js'

const result: ZflowResult = {
  mode: 'prepare-pr',
  localOutput: 'completed',
  prOutput: 'CodeMind GitHub PR creation\n\nOutcome: DRY_RUN',
  collaborationOutput: 'CodeMind PR collaboration\n\nOutcome: DRY_RUN',
  recoveryOutput: 'CodeMind recovery change ledger\n\nChanges: 1',
  rollbackOutput: 'Rollback plan: Recover Zflow preview\n\n1. src/generated.ts',
}

const handoff: ZflowHandoffPacket = {
  summary: {
    readiness: 'READY_FOR_OPERATOR_REVIEW',
    reasons: ['Zflow output includes local result, recovery ledger, and rollback plan.'],
  },
  packet: {
    id: 'handoff-1',
    timestamp: '2026-01-01T00:00:00.000Z',
    sourceEvidence: [],
    proposedAction: 'create_pr',
    actionDetail: 'Review prepared output.',
    risks: [],
    validation: [],
    boundary: [],
    nextManualStep: 'Review prepared output.',
  },
}

describe('zflow report exports', () => {
  it('creates a stable report snapshot', () => {
    const report = createZflowExecutionReport({
      id: 'report-1',
      result,
      handoff,
      generatedAt: '2026-01-01T00:00:00.000Z',
    })
    const snapshot = createZflowReportSnapshot(report)

    expect(snapshot.id).toBe('report-1')
    expect(snapshot.mode).toBe('prepare-pr')
    expect(snapshot.readiness).toBe('READY_FOR_OPERATOR_REVIEW')
    expect(snapshot.hasRecoveryOutput).toBe(true)
    expect(snapshot.hasRollbackOutput).toBe(true)
  })

  it('renders markdown export', () => {
    const report = createZflowExecutionReport({ id: 'report-1', result, handoff })
    const markdown = renderZflowReportMarkdown(report)

    expect(markdown).toContain('# CodeMind Zflow Execution Report')
    expect(markdown).toContain('Readiness: READY_FOR_OPERATOR_REVIEW')
    expect(markdown).toContain('## Recovery output')
    expect(markdown).toContain('No rollback execution')
  })

  it('renders json export', () => {
    const report = createZflowExecutionReport({
      id: 'report-1',
      result,
      handoff,
      generatedAt: '2026-01-01T00:00:00.000Z',
    })
    const parsed = JSON.parse(renderZflowReportJson(report)) as {
      report: { readonly id: string; readonly readiness: string }
      sections: readonly unknown[]
    }

    expect(parsed.report.id).toBe('report-1')
    expect(parsed.report.readiness).toBe('READY_FOR_OPERATOR_REVIEW')
    expect(parsed.sections).toHaveLength(5)
  })
})
