import type { RuntimeLiveReadClient } from '../live-read/runtime-live-read-client.js'
import {
  renderLiveReadAjnaReview,
  runLiveReadAjnaReview,
  type LiveReadAjnaReviewInput,
} from '../ajna/live-read-ajna-review-pipeline.js'
import type { RuntimeToolContext, RuntimeToolDefinition } from '../types.js'

export interface AjnaLiveReadReviewInput {
  readonly owner: string
  readonly repo: string
  readonly prNumber?: number
  readonly workflowRunId?: number
}

function parseAjnaLiveReadReviewInput(input: unknown): AjnaLiveReadReviewInput {
  if (typeof input !== 'object' || input === null) {
    throw new Error('Missing review input.')
  }

  const obj = input as Record<string, unknown>
  const owner = obj['owner']
  const repo = obj['repo']

  if (typeof owner !== 'string' || owner.trim().length === 0) {
    throw new Error('Missing owner.')
  }
  if (typeof repo !== 'string' || repo.trim().length === 0) {
    throw new Error('Missing repo.')
  }

  const prNumber = typeof obj['prNumber'] === 'number' ? obj['prNumber'] : undefined
  const workflowRunId = typeof obj['workflowRunId'] === 'number' ? obj['workflowRunId'] : undefined

  const result: AjnaLiveReadReviewInput = { owner, repo }

  if (prNumber !== undefined) {
    return { ...result, prNumber }
  }
  if (workflowRunId !== undefined) {
    return { ...result, workflowRunId }
  }

  return result
}

export function createAjnaLiveReadReviewTool(client: RuntimeLiveReadClient): RuntimeToolDefinition {
  return {
    name: 'ajna_live_read_review',
    description: 'Run Ajna review pipeline from live-read evidence.',
    capability: 'REVIEW',
    execute: async (input: unknown, _context: RuntimeToolContext): Promise<string> => {
      const parsed = parseAjnaLiveReadReviewInput(input)

      const reviewInput: LiveReadAjnaReviewInput = {
        ...(parsed.prNumber !== undefined
          ? { pr: await client.getPullRequestEvidence(parsed.owner, parsed.repo, parsed.prNumber) }
          : {}),
        ...(parsed.workflowRunId !== undefined
          ? {
              ci: await client.getWorkflowEvidence(parsed.owner, parsed.repo, parsed.workflowRunId),
            }
          : {}),
      }

      const result = runLiveReadAjnaReview(reviewInput)
      return renderLiveReadAjnaReview(result)
    },
  }
}
