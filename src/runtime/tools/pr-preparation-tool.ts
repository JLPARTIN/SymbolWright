import type { RuntimeToolContext, RuntimeToolDefinition } from '../types.js'
import {
  evaluatePrPreparation,
  renderPrPreparation,
  type PrPreparationInput,
} from '../pr-prep/pr-preparation.js'
import { createPrPreparationAuditEvent } from '../pr-prep/pr-preparation-audit.js'
import { renderAuditEvents } from '../audit/runtime-audit-log.js'

export interface PrPreparationToolInput {
  readonly title: string
  readonly body: string
  readonly baseBranch: string
  readonly headBranch: string
  readonly changedFiles: readonly string[]
  readonly validationChecklist: readonly string[]
  readonly reason: string
}

function parsePrPreparationToolInput(input: unknown): PrPreparationToolInput {
  if (typeof input !== 'object' || input === null) {
    throw new Error('Missing PR preparation input.')
  }

  const obj = input as Record<string, unknown>
  const title = obj['title']
  const body = obj['body']
  const baseBranch = obj['baseBranch']
  const headBranch = obj['headBranch']
  const reason = obj['reason']

  if (typeof title !== 'string' || title.trim().length === 0) {
    throw new Error('Missing title.')
  }
  if (typeof body !== 'string' || body.trim().length === 0) {
    throw new Error('Missing body.')
  }
  if (typeof baseBranch !== 'string' || baseBranch.trim().length === 0) {
    throw new Error('Missing baseBranch.')
  }
  if (typeof headBranch !== 'string' || headBranch.trim().length === 0) {
    throw new Error('Missing headBranch.')
  }
  if (typeof reason !== 'string' || reason.trim().length === 0) {
    throw new Error('Missing reason.')
  }

  const changedFiles = Array.isArray(obj['changedFiles'])
    ? (obj['changedFiles'] as unknown[]).filter((item): item is string => typeof item === 'string')
    : []

  const validationChecklist = Array.isArray(obj['validationChecklist'])
    ? (obj['validationChecklist'] as unknown[]).filter((item): item is string => typeof item === 'string')
    : []

  return {
    title,
    body,
    baseBranch,
    headBranch,
    changedFiles,
    validationChecklist,
    reason,
  }
}

export const prPreparationTool: RuntimeToolDefinition = {
  name: 'pr_preparation',
  description: 'Prepare a PR title, body, and validation checklist from approved local changes.',
  capability: 'PR_PREPARATION',
  execute: async (input: unknown, _context: RuntimeToolContext): Promise<string> => {
    const parsed = parsePrPreparationToolInput(input)

    const prepInput: PrPreparationInput = {
      title: parsed.title,
      body: parsed.body,
      baseBranch: parsed.baseBranch,
      headBranch: parsed.headBranch,
      changedFiles: parsed.changedFiles,
      validationChecklist: parsed.validationChecklist,
      reason: parsed.reason,
    }

    const result = evaluatePrPreparation(prepInput)
    const prepOutput = renderPrPreparation(result)
    const auditEvent = createPrPreparationAuditEvent(result)
    const auditOutput = renderAuditEvents([auditEvent])

    return [prepOutput, '', '---', '', auditOutput].join('\n')
  },
}
