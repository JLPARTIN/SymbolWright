import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { AccessRuntime } from '../access/access-runtime.js'
import { GovernanceStore } from '../access/governance-store.js'
import { usdToMicrodollars } from '../access/microdollars.js'
import { MissionService } from '../mission/mission-service.js'
import { createAutonomousMissionRuntime } from './autonomous-mission-runtime.js'

const roots: string[] = []
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('live autonomous budget governance', () => {
  it('stops before the first task when the owning grant has exhausted its daily budget', async () => {
    const workspaceRoot = mkdtempSync(path.join(tmpdir(), 'symbolwright-autonomy-budget-'))
    roots.push(workspaceRoot)
    writeFileSync(path.join(workspaceRoot, 'index.ts'), 'export const budgetFixture = true\n')
    const missionService = new MissionService({ workspaceRoot, env: {} })
    const accessRuntime = new AccessRuntime({ workspaceRoot })
    const { grant } = accessRuntime.grantService.createGrant({
      principalType: 'service-account',
      displayName: 'Budgeted',
      issuedBy: 'operator',
      profileId: 'coding-agent',
      repositoryScope: { mode: 'single', repositories: [], organizations: [] },
      executionLimits: { maxDailyEstimatedCostUsd: 1 },
      reason: 'test',
      issueTokenNow: false,
    })
    const mission = await missionService.create(
      {
        name: 'Budget stop',
        objective: 'Do no provider work',
        repositoryPath: workspaceRoot,
        workspaceKind: 'repository',
        labels: [],
        runtimeMode: 'APPROVED_EXECUTION',
      },
      { grantId: grant.id },
    )
    const governance = new GovernanceStore(path.join(workspaceRoot, 'governance.db'))
    const reservation = governance.reserveUsage({
      grantScope: `grant:${grant.id}`,
      grantId: grant.id,
      reservedMicrodollars: usdToMicrodollars(1),
    })
    governance.settleReservation(reservation.reservationId, usdToMicrodollars(1))
    let calls = 0
    const runtime = createAutonomousMissionRuntime({
      workspaceRoot,
      missionService,
      accessRuntime,
      getGovernanceStore: () => governance,
      taskExecutor: {
        async execute() {
          calls += 1
          return { state: 'completed' }
        },
      },
      validationCommands: ['npm test'],
    })
    const result = await runtime.coordinator.start(mission.id)
    expect(calls).toBe(0)
    expect(result.execution.graph.tasks.every((task) => task.state === 'failed')).toBe(true)
    expect(result.execution.completedAt).toBeDefined()
    expect(result.execution.cancellationReason).toBe('budget')
    governance.close()
  })
})
