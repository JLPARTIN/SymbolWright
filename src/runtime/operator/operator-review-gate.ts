import type { OperatorReviewPacket, OperatorReviewAction } from './operator-review-packet.js'

export type OperatorReviewDecision = 'PENDING' | 'APPROVED' | 'REJECTED'

export interface OperatorReviewGateResult {
  readonly decision: OperatorReviewDecision
  readonly packetId: string
  readonly action: OperatorReviewAction
  readonly reason: string
}

const BLOCKED_ACTIONS: ReadonlySet<OperatorReviewAction> = new Set([
  'merge_pr',
])

export function evaluateOperatorReviewGate(packet: OperatorReviewPacket): OperatorReviewGateResult {
  if (BLOCKED_ACTIONS.has(packet.proposedAction)) {
    return {
      decision: 'REJECTED',
      packetId: packet.id,
      action: packet.proposedAction,
      reason: `Action "${packet.proposedAction}" is blocked by current policy.`,
    }
  }

  return {
    decision: 'PENDING',
    packetId: packet.id,
    action: packet.proposedAction,
    reason: 'Operator review required before execution.',
  }
}

export function renderOperatorReviewGateResult(result: OperatorReviewGateResult): string {
  const lines: string[] = [
    'CodeMind operator review gate',
    '',
    `Packet ID: ${result.packetId}`,
    `Action: ${result.action}`,
    `Decision: ${result.decision}`,
    `Reason: ${result.reason}`,
  ]

  if (result.decision === 'PENDING') {
    lines.push(
      '',
      'No automatic approval is granted.',
      'Operator must review the full packet and confirm before any action is taken.',
    )
  }

  if (result.decision === 'REJECTED') {
    lines.push(
      '',
      'This action is blocked by policy and cannot proceed.',
    )
  }

  return lines.join('\n')
}
