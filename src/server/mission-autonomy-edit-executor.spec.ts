import { describe, expect, it } from 'vitest'

import type { SymbolWrightMission } from '../mission/mission-types.js'
import { ProviderRuntimeOverrideStore } from '../providers/provider-runtime-overrides.js'
import { createMissionAutonomyEditExecutor } from './mission-autonomy-edit-executor.js'

describe('createMissionAutonomyEditExecutor', () => {
  it('keeps write-capable tasks blocked when the mission has no selected provider', () => {
    expect(
      createMissionAutonomyEditExecutor({
        mission: mission(),
        env: {},
        overrideStore: new ProviderRuntimeOverrideStore(),
      }),
    ).toBeUndefined()
  })

  it('assembles the real agent-loop edit executor from persisted provider settings', () => {
    const executor = createMissionAutonomyEditExecutor({
      mission: mission('openai'),
      env: { OPENAI_API_KEY: 'test-key' },
      overrideStore: new ProviderRuntimeOverrideStore(),
    })

    expect(executor).toBeDefined()
    expect(executor?.execute).toBeTypeOf('function')
  })

  it('rejects provider identifiers that are not supported by SymbolWright', () => {
    expect(() =>
      createMissionAutonomyEditExecutor({
        mission: mission('unknown-provider'),
        env: {},
        overrideStore: new ProviderRuntimeOverrideStore(),
      }),
    ).toThrow('Unsupported mission provider: unknown-provider')
  })
})

function mission(activeProviderId?: string): SymbolWrightMission {
  const timestamp = '2026-07-22T22:00:00.000Z'
  return {
    schemaVersion: 1,
    revision: 1,
    id: 'mission-1',
    name: 'Mission 1',
    objective: 'Implement the feature',
    status: 'ACTIVE',
    createdAt: timestamp,
    updatedAt: timestamp,
    lastOpenedAt: timestamp,
    repository: {
      rootPath: '/tmp/symbolwright-mission-provider-test',
      modifiedPaths: [],
    },
    agent: {
      runtimeMode: 'APPROVED_EXECUTION',
      ...(activeProviderId === undefined ? {} : { activeProviderId }),
      model: 'test-model',
      messages: [],
    },
    workspace: {
      kind: 'repository',
      openFiles: [],
      scratchAttached: false,
    },
    evidence: {
      toolCalls: [],
      validationRuns: [],
      webAccesses: [],
      mcpCalls: [],
      subagentRuns: [],
      skillRuns: [],
    },
    references: {
      checkpointIds: [],
      checkpointLinks: [],
      memoryEntryIds: [],
      memoryLinks: [],
      commitShas: [],
      pullRequestUrls: [],
    },
    labels: [],
  }
}
