import type { RuntimeApproval, RuntimePolicySnapshot } from '../runtime/types.js'
import { loadWebConfig } from '../web/web-config.js'
import { performWebSearch, type WebSearchEvidence } from '../web/web-search.js'
import type { WebSearchProvider } from '../web/web-search-provider.js'

import type { RepositoryPortabilityProfile } from './repository-portability.js'

export interface RepositoryPortabilityResearchResult {
  readonly queries: readonly string[]
  readonly evidence: readonly WebSearchEvidence[]
  readonly guidance: readonly string[]
}

export interface ResearchRepositoryPortabilityOptions {
  readonly repositoryRoot: string
  readonly profile: RepositoryPortabilityProfile
  readonly runtimePolicy: RuntimePolicySnapshot
  readonly approval?: RuntimeApproval
  readonly provider?: WebSearchProvider
  readonly maxQueries?: number
}

/**
 * Research is deliberately advisory. Search results are persisted as evidence and
 * guidance only; they never become executable validation commands without local
 * manifest or CI confirmation.
 */
export async function researchRepositoryPortability(
  options: ResearchRepositoryPortabilityOptions,
): Promise<RepositoryPortabilityResearchResult> {
  const queries = options.profile.researchQueries.slice(0, options.maxQueries ?? 3)
  if (queries.length === 0) return { queries: [], evidence: [], guidance: [] }

  const webConfig = loadWebConfig(options.repositoryRoot)
  const evidence: WebSearchEvidence[] = []
  for (const query of queries) {
    evidence.push(
      await performWebSearch({
        query,
        webConfig,
        runtimePolicy: options.runtimePolicy,
        ...(options.approval === undefined ? {} : { approval: options.approval }),
        ...(options.provider === undefined ? {} : { provider: options.provider }),
      }),
    )
  }

  return {
    queries,
    evidence,
    guidance: evidence.flatMap((entry) =>
      entry.results.slice(0, 3).map((result) => `${result.title}: ${result.snippet} (${result.url})`),
    ),
  }
}
