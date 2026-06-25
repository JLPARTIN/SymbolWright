import type { RuntimeToolContext, RuntimeToolDefinition } from '../types.js'
import {
  createOperatorReviewPacket,
  renderOperatorReviewPacket,
  type OperatorReviewAction,
} from '../operator/operator-review-packet.js'
import {
  evaluateOperatorReviewGate,
  renderOperatorReviewGateResult,
} from '../operator/operator-review-gate.js'

const VALID_ACTIONS: ReadonlySet<string> = new Set<OperatorReviewAction>([
  'post_pr_comment',
  'apply_label',
  'request_review',
  'submit_review',
  'create_pr',
  'merge_pr',
])

export interface OperatorReviewPacketInput {
  readonly id: string
  readonly sourceEvidence: readonly string[]
  readonly proposedAction: OperatorReviewAction
  readonly actionDetail: string
  readonly risks: readonly string[]
  readonly validation: readonly string[]
  readonly boundary: readonly string[]
  readonly nextManualStep: string
}

function parseOperatorReviewPacketInput(input: unknown): OperatorReviewPacketInput {
  if (typeof input !== 'object' || input === null) {
    throw new Error('Missing operator review packet input.')
  }

  const obj = input as Record<string, unknown>
  const id = obj['id']
  const proposedAction = obj['proposedAction']
  const actionDetail = obj['actionDetail']
  const nextManualStep = obj['nextManualStep']

  if (typeof id !== 'string' || id.trim().length === 0) {
    throw new Error('Missing packet id.')
  }
  if (typeof proposedAction !== 'string' || !VALID_ACTIONS.has(proposedAction)) {
    throw new Error(`Invalid proposedAction: ${String(proposedAction)}`)
  }
  if (typeof actionDetail !== 'string' || actionDetail.trim().length === 0) {
    throw new Error('Missing actionDetail.')
  }
  if (typeof nextManualStep !== 'string' || nextManualStep.trim().length === 0) {
    throw new Error('Missing nextManualStep.')
  }

  const sourceEvidence = Array.isArray(obj['sourceEvidence'])
    ? (obj['sourceEvidence'] as unknown[]).filter((item): item is string => typeof item === 'string')
    : []

  const risks = Array.isArray(obj['risks'])
    ? (obj['risks'] as unknown[]).filter((item): item is string => typeof item === 'string')
    : []

  const validation = Array.isArray(obj['validation'])
    ? (obj['validation'] as unknown[]).filter((item): item is string => typeof item === 'string')
    : []

  const boundary = Array.isArray(obj['boundary'])
    ? (obj['boundary'] as unknown[]).filter((item): item is string => typeof item === 'string')
    : []

  return {
    id,
    sourceEvidence,
    proposedAction: proposedAction as OperatorReviewAction,
    actionDetail,
    risks,
    validation,
    boundary,
    nextManualStep,
  }
}

export const operatorReviewPacketTool: RuntimeToolDefinition = {
  name: 'operator_review_packet',
  description: 'Create an operator review packet for a proposed action.',
  capability: 'OPERATOR_REVIEW',
  execute: async (input: unknown, _context: RuntimeToolContext): Promise<string> => {
    const parsed = parseOperatorReviewPacketInput(input)
    const packet = createOperatorReviewPacket(parsed)
    const gateResult = evaluateOperatorReviewGate(packet)

    const packetOutput = renderOperatorReviewPacket(packet)
    const gateOutput = renderOperatorReviewGateResult(gateResult)

    return [packetOutput, '', '---', '', gateOutput].join('\n')
  },
}
