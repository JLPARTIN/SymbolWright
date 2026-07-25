import { bridgeRuntimeEvidenceToAjna } from '../ajna/runtime-ajna-evidence-bridge.js'
import { buildCiEvidenceSummary } from '../evidence/ci-evidence-summary.js'
import type { RuntimeLiveReadClient } from '../live-read/runtime-live-read-client.js'
import type { RuntimeToolContext, RuntimeToolDefinition } from '../types.js'

export interface GitHubLiveReadCiInput {
  readonly owner: string
  readonly repo: string
  readonly runId: number
}

function parseGitHubLiveReadCiInput(input: unknown): GitHubLiveReadCiInput {
  if (typeof input !== 'object' || input === null) {
    throw new Error('Missing CI read input.')
  }

  const obj = input as Record<string, unknown>
  const owner = obj['owner']
  const repo = obj['repo']
  const runId = obj['runId']

  if (typeof owner !== 'string' || owner.trim().length === 0) {
    throw new Error('Missing owner.')
  }
  if (typeof repo !== 'string' || repo.trim().length === 0) {
    throw new Error('Missing repo.')
  }
  if (typeof runId !== 'number' || !Number.isInteger(runId) || runId <= 0) {
    throw new Error('Missing or invalid runId.')
  }

  return { owner, repo, runId }
}

export function createGitHubLiveReadCiTool(client: RuntimeLiveReadClient): RuntimeToolDefinition {
  return {
    name: 'github_live_read_ci',
    description: 'Read GitHub CI/workflow evidence through policy-gated live read client.',
    capability: 'LIVE_READ_CLIENT',
    execute: async (input: unknown, _context: RuntimeToolContext): Promise<string> => {
      const parsed = parseGitHubLiveReadCiInput(input)
      const evidence = await client.getWorkflowEvidence(parsed.owner, parsed.repo, parsed.runId)
      const summary = buildCiEvidenceSummary(evidence)
      const ajna = bridgeRuntimeEvidenceToAjna({ ci: summary })

      return [
        'SymbolWright GitHub live read CI',
        '',
        `Repository: ${parsed.owner}/${parsed.repo}`,
        summary.title,
        ...summary.lines.map((line) => `- ${line}`),
        '',
        `Ajna bridge verdict: ${ajna.verdict}`,
        '',
        'Boundary:',
        '- policy-gated read-only',
        '- no workflow reruns',
        '- no comments are posted',
        '- no approvals are submitted',
      ].join('\n')
    },
  }
}
