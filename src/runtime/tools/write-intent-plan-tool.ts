import type { RuntimeToolContext, RuntimeToolDefinition } from '../types.js'
import { createWriteIntent, renderWriteIntent, type WriteIntentTarget } from '../write/write-intent.js'
import { validateWriteIntent, renderWriteIntentValidation } from '../write/write-intent-validator.js'
import { createWriteApprovalTicket, renderWriteApprovalTicket } from '../write/write-approval-ticket.js'

const VALID_TARGETS: ReadonlySet<string> = new Set<WriteIntentTarget>([
  'file_edit',
  'file_create',
  'file_delete',
  'github_pr_comment',
  'github_label',
  'github_review',
  'github_pr_create',
])

export interface WriteIntentPlanInput {
  readonly id: string
  readonly target: WriteIntentTarget
  readonly targetPath: string
  readonly reason: string
  readonly expectedDiffSummary: string
  readonly validationPlan: readonly string[]
  readonly rollbackNote: string
}

function parseWriteIntentPlanInput(input: unknown): WriteIntentPlanInput {
  if (typeof input !== 'object' || input === null) {
    throw new Error('Missing write intent plan input.')
  }

  const obj = input as Record<string, unknown>
  const id = obj['id']
  const target = obj['target']
  const targetPath = obj['targetPath']
  const reason = obj['reason']
  const expectedDiffSummary = obj['expectedDiffSummary']
  const rollbackNote = obj['rollbackNote']

  if (typeof id !== 'string' || id.trim().length === 0) {
    throw new Error('Missing intent id.')
  }
  if (typeof target !== 'string' || !VALID_TARGETS.has(target)) {
    throw new Error(`Invalid target: ${String(target)}`)
  }
  if (typeof targetPath !== 'string' || targetPath.trim().length === 0) {
    throw new Error('Missing targetPath.')
  }
  if (typeof reason !== 'string' || reason.trim().length === 0) {
    throw new Error('Missing reason.')
  }
  if (typeof expectedDiffSummary !== 'string' || expectedDiffSummary.trim().length === 0) {
    throw new Error('Missing expectedDiffSummary.')
  }
  if (typeof rollbackNote !== 'string' || rollbackNote.trim().length === 0) {
    throw new Error('Missing rollbackNote.')
  }

  const validationPlan = Array.isArray(obj['validationPlan'])
    ? (obj['validationPlan'] as unknown[]).filter((item): item is string => typeof item === 'string')
    : []

  return {
    id,
    target: target as WriteIntentTarget,
    targetPath,
    reason,
    expectedDiffSummary,
    validationPlan,
    rollbackNote,
  }
}

export const writeIntentPlanTool: RuntimeToolDefinition = {
  name: 'write_intent_plan',
  description: 'Create a write intent plan with validation and approval ticket.',
  capability: 'WRITE_INTENT',
  execute: async (input: unknown, context: RuntimeToolContext): Promise<string> => {
    const parsed = parseWriteIntentPlanInput(input)
    const intent = createWriteIntent(parsed)
    const validation = validateWriteIntent(intent, context.cwd)
    const ticket = createWriteApprovalTicket(intent, validation)

    const intentOutput = renderWriteIntent(intent)
    const validationOutput = renderWriteIntentValidation(validation)
    const ticketOutput = renderWriteApprovalTicket(ticket)

    return [intentOutput, '', '---', '', validationOutput, '', '---', '', ticketOutput].join('\n')
  },
}
