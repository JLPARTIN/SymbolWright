import type { RuntimeLiveReadClient } from '../live-read/runtime-live-read-client.js'
import { assessLiveReadMergeReadiness, renderLiveReadAjnaMergeReadiness } from '../ajna/live-read-ajna-merge-readiness-pipeline.js'
import type { RuntimeToolContext, RuntimeToolDefinition } from '../types.js'

export interface AjnaLiveReadMergeReadinessInput {
  readonly owner: string
  readonly repo: string
  readonly prNumber: number
  readonly workflowRunId?: number
}

function parseAjnaLiveReadMergeReadinessInput(input: unknown): AjnaLiveReadMergeReadinessInput {
  if (typeof input !== 'object' || input === null) {
    throw new Error('Missing merge readiness input.')
  }

  const obj = input as Record<string, unknown>
  const owner = obj['owner']
  const repo = obj['repo']
  const prNumber = obj['prNumber']

  if (typeof owner !== 'string' || owner.trim().length === 0) {
    throw new Error('Missing owner.')
  }
  if (typeof repo !== 'string' || repo.trim().length === 0) {
    throw new Error('Missing repo.')
  }
  if (typeof prNumber !== 'number' || !Number.isInteger(prNumber) || prNumber <= 0) {
    throw new Error('Missing or invalid prNumber.')
  }

  const workflowRunId = typeof obj['workflowRunId'] === 'number' ? obj['workflowRunId'] : undefined

  const result: AjnaLiveReadMergeReadinessInput = { owner, repo, prNumber }

  if (workflowRunId !== undefined) {
    return { ...result, workflowRunId }
  }

  return result
}

export function createAjnaLiveReadMergeReadinessTool(client: RuntimeLiveReadClient): RuntimeToolDefinition {
  return {
    name: 'ajna_live_read_merge_readiness',
    description: 'Assess merge readiness from live-read evidence.',
    capability: 'REVIEW',
    execute: async (input: unknown, _context: RuntimeToolContext): Promise<string> => {
      const parsed = parseAjnaLiveReadMergeReadinessInput(input)

      const pr = await client.getPullRequestEvidence(parsed.owner, parsed.repo, parsed.prNumber)

      const mergeInput = {
        pr,
        ...(parsed.workflowRunId !== undefined
          ? { ci: await client.getWorkflowEvidence(parsed.owner, parsed.repo, parsed.workflowRunId) }
          : {}),
      }

      const result = assessLiveReadMergeReadiness(mergeInput)
      return renderLiveReadAjnaMergeReadiness(result)
    },
  }
}
