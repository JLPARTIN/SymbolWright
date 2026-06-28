import type { ProviderTokenUsage } from '../provider/provider.types.js'

/** Per-million-token cost rates for a model. */
export interface CostRate {
  readonly inputPerMillion: number
  readonly outputPerMillion: number
  readonly cacheReadPerMillion?: number
  readonly cacheCreationPerMillion?: number
}

export const DEFAULT_COST_RATES: Record<string, CostRate> = {
  'claude-sonnet-4-20250514': {
    inputPerMillion: 3,
    outputPerMillion: 15,
    cacheReadPerMillion: 0.3,
    cacheCreationPerMillion: 3.75,
  },
  'claude-haiku-3-5-20241022': {
    inputPerMillion: 0.8,
    outputPerMillion: 4,
    cacheReadPerMillion: 0.08,
    cacheCreationPerMillion: 1,
  },
}

const FALLBACK_RATE: CostRate = {
  inputPerMillion: 3,
  outputPerMillion: 15,
}

/** A single usage record with model, tokens, cost, and source. */
export interface UsageRecord {
  readonly sessionId: string
  readonly model: string
  readonly usage: ProviderTokenUsage
  readonly costUsd: number
  readonly timestamp: string
  readonly source: 'orchestrator' | 'swarm' | 'unknown'
  readonly agentId?: string
}

/** Aggregated usage summary with breakdowns by model and source. */
export interface UsageSummary {
  readonly totalInputTokens: number
  readonly totalOutputTokens: number
  readonly totalCostUsd: number
  readonly recordCount: number
  readonly byModel: Record<string, ModelUsageSummary>
  readonly bySource: Record<string, SourceUsageSummary>
}

export interface ModelUsageSummary {
  readonly model: string
  readonly inputTokens: number
  readonly outputTokens: number
  readonly costUsd: number
  readonly count: number
}

export interface SourceUsageSummary {
  readonly source: string
  readonly inputTokens: number
  readonly outputTokens: number
  readonly costUsd: number
  readonly count: number
}

/** Computes USD cost from token usage and model-specific rates. */
export function computeCost(
  usage: ProviderTokenUsage,
  model: string,
  rates?: Record<string, CostRate>,
): number {
  const rateTable = rates ?? DEFAULT_COST_RATES
  const rate = rateTable[model] ?? FALLBACK_RATE

  let cost = 0
  cost += (usage.inputTokens / 1_000_000) * rate.inputPerMillion
  cost += (usage.outputTokens / 1_000_000) * rate.outputPerMillion

  if (usage.cacheReadInputTokens !== undefined && rate.cacheReadPerMillion !== undefined) {
    cost += (usage.cacheReadInputTokens / 1_000_000) * rate.cacheReadPerMillion
  }

  if (usage.cacheCreationInputTokens !== undefined && rate.cacheCreationPerMillion !== undefined) {
    cost += (usage.cacheCreationInputTokens / 1_000_000) * rate.cacheCreationPerMillion
  }

  return cost
}

/** Tracks per-request usage records and produces aggregated summaries. */
export class CostTracker {
  private readonly records: UsageRecord[] = []
  private readonly rates: Record<string, CostRate>

  constructor(rates?: Record<string, CostRate>) {
    this.rates = rates ?? DEFAULT_COST_RATES
  }

  record(
    sessionId: string,
    model: string,
    usage: ProviderTokenUsage,
    source: 'orchestrator' | 'swarm' | 'unknown' = 'unknown',
    agentId?: string,
  ): UsageRecord {
    const costUsd = computeCost(usage, model, this.rates)

    const entry: UsageRecord = {
      sessionId,
      model,
      usage,
      costUsd,
      timestamp: new Date().toISOString(),
      source,
      ...(agentId !== undefined ? { agentId } : {}),
    }

    this.records.push(entry)
    return entry
  }

  summarize(sessionId?: string): UsageSummary {
    const filtered =
      sessionId !== undefined ? this.records.filter((r) => r.sessionId === sessionId) : this.records

    let totalInputTokens = 0
    let totalOutputTokens = 0
    let totalCostUsd = 0
    const byModel: Record<string, ModelUsageSummary> = {}
    const bySource: Record<string, SourceUsageSummary> = {}

    for (const r of filtered) {
      totalInputTokens += r.usage.inputTokens
      totalOutputTokens += r.usage.outputTokens
      totalCostUsd += r.costUsd

      const existing = byModel[r.model]
      if (existing !== undefined) {
        byModel[r.model] = {
          model: r.model,
          inputTokens: existing.inputTokens + r.usage.inputTokens,
          outputTokens: existing.outputTokens + r.usage.outputTokens,
          costUsd: existing.costUsd + r.costUsd,
          count: existing.count + 1,
        }
      } else {
        byModel[r.model] = {
          model: r.model,
          inputTokens: r.usage.inputTokens,
          outputTokens: r.usage.outputTokens,
          costUsd: r.costUsd,
          count: 1,
        }
      }

      const srcExisting = bySource[r.source]
      if (srcExisting !== undefined) {
        bySource[r.source] = {
          source: r.source,
          inputTokens: srcExisting.inputTokens + r.usage.inputTokens,
          outputTokens: srcExisting.outputTokens + r.usage.outputTokens,
          costUsd: srcExisting.costUsd + r.costUsd,
          count: srcExisting.count + 1,
        }
      } else {
        bySource[r.source] = {
          source: r.source,
          inputTokens: r.usage.inputTokens,
          outputTokens: r.usage.outputTokens,
          costUsd: r.costUsd,
          count: 1,
        }
      }
    }

    return {
      totalInputTokens,
      totalOutputTokens,
      totalCostUsd,
      recordCount: filtered.length,
      byModel,
      bySource,
    }
  }

  getRecords(): readonly UsageRecord[] {
    return [...this.records]
  }

  clear(): void {
    this.records.length = 0
  }
}

/** Renders a usage summary as a human-readable multi-line string. */
export function renderUsageSummary(summary: UsageSummary): string {
  const lines: string[] = [
    'CodeMind Usage Summary',
    '',
    `Total Input Tokens:  ${summary.totalInputTokens.toLocaleString()}`,
    `Total Output Tokens: ${summary.totalOutputTokens.toLocaleString()}`,
    `Total Cost:          $${summary.totalCostUsd.toFixed(4)}`,
    `Total Requests:      ${summary.recordCount}`,
  ]

  const modelKeys = Object.keys(summary.byModel)
  if (modelKeys.length > 0) {
    lines.push('', 'By Model:')
    for (const key of modelKeys) {
      const m = summary.byModel[key]
      if (m !== undefined) {
        lines.push(`  ${m.model}: ${m.count} requests, $${m.costUsd.toFixed(4)}`)
      }
    }
  }

  const sourceKeys = Object.keys(summary.bySource)
  if (sourceKeys.length > 0) {
    lines.push('', 'By Source:')
    for (const key of sourceKeys) {
      const s = summary.bySource[key]
      if (s !== undefined) {
        lines.push(`  ${s.source}: ${s.count} requests, $${s.costUsd.toFixed(4)}`)
      }
    }
  }

  return lines.join('\n')
}
