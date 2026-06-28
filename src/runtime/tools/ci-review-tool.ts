import type { RuntimeToolContext, RuntimeToolDefinition } from '../types.js'
import { renderCiReviewDraft, type CiReviewDraft } from '../renderers/ci-review-renderer.js'

export interface CiReviewInput {
  readonly status?: string
  readonly source?: string
  readonly findings?: readonly string[]
}

function parseCiReviewInput(input: unknown): CiReviewInput {
  const value =
    typeof input === 'object' && input !== null ? (input as Record<string, unknown>) : {}
  const parsed: { status?: string; source?: string; findings?: readonly string[] } = {}

  if (typeof value['status'] === 'string') {
    parsed.status = value['status']
  }
  if (typeof value['source'] === 'string') {
    parsed.source = value['source']
  }
  if (
    Array.isArray(value['findings']) &&
    value['findings'].every((item) => typeof item === 'string')
  ) {
    parsed.findings = value['findings']
  }

  return parsed
}

export function buildCiReviewDraft(input: CiReviewInput): CiReviewDraft {
  const status = input.status?.trim() || 'not provided'
  const source = input.source?.trim() || 'local fixture or operator-provided context'

  return {
    source,
    status,
    findings: input.findings ?? [],
    nextSteps: [
      'Review the local CI context supplied by the operator.',
      'Map each failure to the smallest likely file or command surface.',
      'Prepare a proposal before any edit or command execution path is used.',
    ],
  }
}

export async function executeCiReviewTool(
  input: CiReviewInput,
  _context: RuntimeToolContext,
): Promise<string> {
  return renderCiReviewDraft(buildCiReviewDraft(input))
}

export const ciReviewTool: RuntimeToolDefinition = {
  name: 'ci_review',
  description: 'Draft a local CI review without querying services.',
  capability: 'REVIEW',
  execute: async (input, context) => executeCiReviewTool(parseCiReviewInput(input), context),
}
