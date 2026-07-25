import { describe, expect, it } from 'vitest'

import type { ZflowResult } from './zflow-workflow.js'
import {
  createZflowHandoffPacket,
  renderZflowHandoffPacket,
  summarizeZflowReadiness,
} from './zflow-handoff.js'

const result: ZflowResult = {
  mode: 'prepare-pr',
  localOutput: 'completed',
  prOutput: 'SymbolWright GitHub PR creation\n\nOutcome: DRY_RUN',
  collaborationOutput: 'SymbolWright PR collaboration\n\nOutcome: DRY_RUN',
  recoveryOutput: 'SymbolWright recovery change ledger\n\nChanges: 1',
  rollbackOutput: 'Rollback plan: Recover Zflow preview\n\n1. src/generated.ts',
}

describe('zflow handoff', () => {
  it('summarizes ready output', () => {
    const summary = summarizeZflowReadiness(result)

    expect(summary.readiness).toBe('READY_FOR_OPERATOR_REVIEW')
    expect(summary.reasons[0]).toContain('Zflow output includes')
  })

  it('detects missing recovery details', () => {
    const summary = summarizeZflowReadiness({
      ...result,
      recoveryOutput: 'missing',
    })

    expect(summary.readiness).toBe('NEEDS_RECOVERY_DETAIL')
    expect(summary.reasons).toContain('Missing recovery ledger output.')
  })

  it('renders an operator handoff packet', () => {
    const handoff = createZflowHandoffPacket({
      id: 'handoff-1',
      result,
      nextManualStep: 'Review the prepared output.',
    })
    const output = renderZflowHandoffPacket(handoff)

    expect(output).toContain('SymbolWright zflow handoff')
    expect(output).toContain('READY_FOR_OPERATOR_REVIEW')
    expect(output).toContain('SymbolWright operator review packet')
    expect(output).toContain('PENDING_OPERATOR_REVIEW')
  })
})
