import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { parseMicrodollars } from '../access/microdollars.js'
import { MissionService } from './mission-service.js'

describe('MissionService.recordUsage', () => {
  let root: string
  let service: MissionService

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'symbolwright-mission-usage-'))
    service = new MissionService({ workspaceRoot: root })
  })

  afterEach(() => rmSync(root, { recursive: true, force: true }))

  async function createMission() {
    return service.create({
      name: 'm',
      objective: 'o',
      workspaceKind: 'scratch',
      repositoryPath: '.',
      runtimeMode: 'READ_ONLY',
      labels: [],
    })
  }

  it('captures token usage and cost for a known model on a mission that had none before', async () => {
    const mission = await createMission()
    expect(mission.usage).toBeUndefined()

    const updated = service.recordUsage(
      mission.id,
      { inputTokens: 1_000_000, outputTokens: 1_000_000 },
      'claude-sonnet-4-20250514',
    )

    expect(updated.usage?.totalPromptUnits).toBe(1_000_000)
    expect(updated.usage?.totalCompletionUnits).toBe(1_000_000)
    expect(parseMicrodollars(updated.usage!.totalCostMicrodollars)).toBe(3_000_000n + 15_000_000n)
  })

  it('accumulates usage across multiple calls', async () => {
    const mission = await createMission()
    service.recordUsage(
      mission.id,
      { inputTokens: 100, outputTokens: 200 },
      'claude-sonnet-4-20250514',
    )
    const second = service.recordUsage(
      mission.id,
      { inputTokens: 50, outputTokens: 25 },
      'claude-sonnet-4-20250514',
    )

    expect(second.usage?.totalPromptUnits).toBe(150)
    expect(second.usage?.totalCompletionUnits).toBe(225)
  })

  it('captures token counts even when no model is specified, with zero cost attributed', async () => {
    const mission = await createMission()
    const updated = service.recordUsage(mission.id, { inputTokens: 10, outputTokens: 20 })

    expect(updated.usage?.totalPromptUnits).toBe(10)
    expect(updated.usage?.totalCompletionUnits).toBe(20)
    expect(parseMicrodollars(updated.usage!.totalCostMicrodollars)).toBe(0n)
  })

  it('captures token counts for an unrecognized model without throwing, attributing zero cost', async () => {
    const mission = await createMission()
    const updated = service.recordUsage(
      mission.id,
      { inputTokens: 10, outputTokens: 20 },
      'some-future-model-not-in-the-rate-table',
    )

    expect(updated.usage?.totalPromptUnits).toBe(10)
    expect(parseMicrodollars(updated.usage!.totalCostMicrodollars)).toBe(0n)
  })

  it('persists across a service restart against the same workspace', async () => {
    const mission = await createMission()
    service.recordUsage(mission.id, { inputTokens: 5, outputTokens: 5 }, 'claude-sonnet-4-20250514')

    const restarted = new MissionService({ workspaceRoot: root })
    const reloaded = restarted.get(mission.id)
    expect(reloaded.usage?.totalPromptUnits).toBe(5)
  })
})
