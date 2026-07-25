import { describe, expect, it, beforeEach } from 'vitest'

import { computeCost, CostTracker, renderUsageSummary, DEFAULT_COST_RATES } from './cost-tracker.js'
import type { ProviderTokenUsage } from '../provider/provider.types.js'

const USAGE: ProviderTokenUsage = {
  inputTokens: 1000,
  outputTokens: 500,
}

const USAGE_WITH_CACHE: ProviderTokenUsage = {
  inputTokens: 1000,
  outputTokens: 500,
  cacheReadInputTokens: 200,
  cacheCreationInputTokens: 100,
}

describe('computeCost', () => {
  it('computes cost for known model', () => {
    const cost = computeCost(USAGE, 'claude-sonnet-4-20250514')
    const expected = (1000 / 1_000_000) * 3 + (500 / 1_000_000) * 15

    expect(cost).toBeCloseTo(expected)
  })

  it('includes cache costs when present', () => {
    const cost = computeCost(USAGE_WITH_CACHE, 'claude-sonnet-4-20250514')
    const rate = DEFAULT_COST_RATES['claude-sonnet-4-20250514']!

    const expected =
      (1000 / 1_000_000) * rate.inputPerMillion +
      (500 / 1_000_000) * rate.outputPerMillion +
      (200 / 1_000_000) * rate.cacheReadPerMillion! +
      (100 / 1_000_000) * rate.cacheCreationPerMillion!

    expect(cost).toBeCloseTo(expected)
  })

  it('uses fallback rate for unknown model', () => {
    const cost = computeCost(USAGE, 'unknown-model')
    const expected = (1000 / 1_000_000) * 3 + (500 / 1_000_000) * 15
    expect(cost).toBeCloseTo(expected)
  })

  it('accepts custom rates', () => {
    const rates = { 'custom-model': { inputPerMillion: 1, outputPerMillion: 2 } }
    const cost = computeCost(USAGE, 'custom-model', rates)
    const expected = (1000 / 1_000_000) * 1 + (500 / 1_000_000) * 2
    expect(cost).toBeCloseTo(expected)
  })
})

describe('CostTracker', () => {
  let tracker: CostTracker

  beforeEach(() => {
    tracker = new CostTracker()
  })

  it('starts empty', () => {
    expect(tracker.getRecords()).toHaveLength(0)
  })

  it('records usage', () => {
    const record = tracker.record('session-1', 'claude-sonnet-4-20250514', USAGE, 'orchestrator')
    expect(record.sessionId).toBe('session-1')
    expect(record.model).toBe('claude-sonnet-4-20250514')
    expect(record.costUsd).toBeGreaterThan(0)
    expect(record.source).toBe('orchestrator')
    expect(record.timestamp).toBeTruthy()
  })

  it('records with agent id', () => {
    const record = tracker.record('s1', 'claude-sonnet-4-20250514', USAGE, 'swarm', 'agent-1')
    expect(record.agentId).toBe('agent-1')
  })

  it('summarizes all records', () => {
    tracker.record('s1', 'claude-sonnet-4-20250514', USAGE, 'orchestrator')
    tracker.record('s1', 'claude-sonnet-4-20250514', USAGE, 'swarm')

    const summary = tracker.summarize()
    expect(summary.recordCount).toBe(2)
    expect(summary.totalInputTokens).toBe(2000)
    expect(summary.totalOutputTokens).toBe(1000)
    expect(summary.totalCostUsd).toBeGreaterThan(0)
  })

  it('summarizes by session', () => {
    tracker.record('s1', 'claude-sonnet-4-20250514', USAGE, 'orchestrator')
    tracker.record('s2', 'claude-sonnet-4-20250514', USAGE, 'orchestrator')

    const summary = tracker.summarize('s1')
    expect(summary.recordCount).toBe(1)
    expect(summary.totalInputTokens).toBe(1000)
  })

  it('groups by model', () => {
    tracker.record('s1', 'claude-sonnet-4-20250514', USAGE, 'orchestrator')
    tracker.record('s1', 'claude-haiku-3-5-20241022', USAGE, 'swarm')

    const summary = tracker.summarize()
    expect(Object.keys(summary.byModel)).toHaveLength(2)
    expect(summary.byModel['claude-sonnet-4-20250514']!.count).toBe(1)
  })

  it('groups by source', () => {
    tracker.record('s1', 'claude-sonnet-4-20250514', USAGE, 'orchestrator')
    tracker.record('s1', 'claude-sonnet-4-20250514', USAGE, 'swarm')
    tracker.record('s1', 'claude-sonnet-4-20250514', USAGE, 'swarm')

    const summary = tracker.summarize()
    expect(summary.bySource['orchestrator']!.count).toBe(1)
    expect(summary.bySource['swarm']!.count).toBe(2)
  })

  it('clear removes all records', () => {
    tracker.record('s1', 'claude-sonnet-4-20250514', USAGE, 'orchestrator')
    tracker.clear()
    expect(tracker.getRecords()).toHaveLength(0)
  })

  it('handles empty summary', () => {
    const summary = tracker.summarize()
    expect(summary.totalInputTokens).toBe(0)
    expect(summary.totalCostUsd).toBe(0)
    expect(summary.recordCount).toBe(0)
  })
})

describe('renderUsageSummary', () => {
  it('renders complete summary', () => {
    const tracker = new CostTracker()
    tracker.record('s1', 'claude-sonnet-4-20250514', USAGE, 'orchestrator')

    const output = renderUsageSummary(tracker.summarize())
    expect(output).toContain('SymbolWright Usage Summary')
    expect(output).toContain('Total Input Tokens')
    expect(output).toContain('Total Output Tokens')
    expect(output).toContain('Total Cost')
    expect(output).toContain('By Model')
    expect(output).toContain('By Source')
  })

  it('renders empty summary', () => {
    const output = renderUsageSummary({
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalCostUsd: 0,
      recordCount: 0,
      byModel: {},
      bySource: {},
    })
    expect(output).toContain('Total Requests:      0')
  })
})
