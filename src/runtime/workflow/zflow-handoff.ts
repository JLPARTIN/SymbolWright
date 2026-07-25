import {
  createOperatorReviewPacket,
  renderOperatorReviewPacket,
  type OperatorReviewPacket,
} from '../operator/operator-review-packet.js'
import {
  evaluateOperatorReviewGate,
  renderOperatorReviewGateResult,
} from '../operator/operator-review-gate.js'
import type { ZflowResult } from './zflow-workflow.js'

export type ZflowReadiness = 'READY_FOR_OPERATOR_REVIEW' | 'NEEDS_RECOVERY_DETAIL' | 'BLOCKED'

export interface ZflowReadinessSummary {
  readonly readiness: ZflowReadiness
  readonly reasons: readonly string[]
}

export interface ZflowHandoffPacket {
  readonly summary: ZflowReadinessSummary
  readonly packet: OperatorReviewPacket
}

export function summarizeZflowReadiness(result: ZflowResult): ZflowReadinessSummary {
  const reasons: string[] = []

  if (!result.recoveryOutput.includes('SymbolWright recovery change ledger')) {
    reasons.push('Missing recovery ledger output.')
  }

  if (!result.rollbackOutput.includes('Rollback plan:')) {
    reasons.push('Missing rollback plan output.')
  }

  if (result.localOutput !== 'completed') {
    reasons.push(`Local workflow did not complete: ${result.localOutput}`)
  }

  if (reasons.length > 0) {
    return {
      readiness: result.localOutput === 'blocked' ? 'BLOCKED' : 'NEEDS_RECOVERY_DETAIL',
      reasons,
    }
  }

  return {
    readiness: 'READY_FOR_OPERATOR_REVIEW',
    reasons: ['Zflow output includes local result, recovery ledger, and rollback plan.'],
  }
}

export function createZflowHandoffPacket(input: {
  readonly id: string
  readonly result: ZflowResult
  readonly nextManualStep: string
}): ZflowHandoffPacket {
  const summary = summarizeZflowReadiness(input.result)
  const packet = createOperatorReviewPacket({
    id: input.id,
    sourceEvidence: [
      `Mode: ${input.result.mode}`,
      `Local result: ${input.result.localOutput}`,
      input.result.recoveryOutput,
      input.result.rollbackOutput,
    ],
    proposedAction: 'create_pr',
    actionDetail: 'Review prepared Zflow output and decide whether to continue.',
    risks: [
      'Prepared output may need operator review before any live repository mutation.',
      'Rollback plan is reporting-only and does not execute recovery steps.',
    ],
    validation: [`Readiness: ${summary.readiness}`, ...summary.reasons],
    boundary: ['No live GitHub mutation by default.', 'No rollback execution.', 'No merge action.'],
    nextManualStep: input.nextManualStep,
  })

  return { summary, packet }
}

export function renderZflowHandoffPacket(handoff: ZflowHandoffPacket): string {
  const gateResult = evaluateOperatorReviewGate(handoff.packet)

  return [
    'SymbolWright zflow handoff',
    '',
    `Readiness: ${handoff.summary.readiness}`,
    '',
    'Readiness reasons:',
    ...handoff.summary.reasons.map((reason) => `- ${reason}`),
    '',
    renderOperatorReviewPacket(handoff.packet),
    '',
    '---',
    '',
    renderOperatorReviewGateResult(gateResult),
  ].join('\n')
}
