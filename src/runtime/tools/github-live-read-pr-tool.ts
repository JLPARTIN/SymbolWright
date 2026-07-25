import { bridgeRuntimeEvidenceToAjna } from '../ajna/runtime-ajna-evidence-bridge.js'
import { buildPrEvidenceSummary } from '../evidence/pr-evidence-builder.js'
import type { RuntimeLiveReadClient } from '../live-read/runtime-live-read-client.js'
import type { RuntimeToolContext, RuntimeToolDefinition } from '../types.js'

export interface GitHubLiveReadPrInput {
  readonly owner: string
  readonly repo: string
  readonly prNumber: number
}

function parseGitHubLiveReadPrInput(input: unknown): GitHubLiveReadPrInput {
  if (typeof input !== 'object' || input === null) {
    throw new Error('Missing PR read input.')
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

  return { owner, repo, prNumber }
}

export function createGitHubLiveReadPrTool(client: RuntimeLiveReadClient): RuntimeToolDefinition {
  return {
    name: 'github_live_read_pr',
    description: 'Read GitHub PR evidence through policy-gated live read client.',
    capability: 'LIVE_READ_CLIENT',
    execute: async (input: unknown, _context: RuntimeToolContext): Promise<string> => {
      const parsed = parseGitHubLiveReadPrInput(input)
      const evidence = await client.getPullRequestEvidence(
        parsed.owner,
        parsed.repo,
        parsed.prNumber,
      )
      const summary = buildPrEvidenceSummary(evidence)
      const ajna = bridgeRuntimeEvidenceToAjna({ pr: summary })

      return [
        'SymbolWright GitHub live read PR',
        '',
        `Repository: ${parsed.owner}/${parsed.repo}`,
        summary.title,
        ...summary.lines.map((line) => `- ${line}`),
        '',
        `Ajna bridge verdict: ${ajna.verdict}`,
        '',
        'Boundary:',
        '- policy-gated read-only',
        '- no comments are posted',
        '- no approvals are submitted',
        '- no merges are performed',
      ].join('\n')
    },
  }
}
