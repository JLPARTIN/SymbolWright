import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { OrchestrationStore } from './orchestration-store.js'
import {
  normalizeAgentResourceLimits,
  normalizeTeamBudget,
  normalizeTeamBudgetUsage,
} from './orchestration-types.js'

const roots: string[] = []
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('orchestration fixed-point money', () => {
  it('migrates legacy floating USD values to canonical microdollar strings', () => {
    expect(normalizeTeamBudget({ maxEstimatedCostUsd: 1.25 } as never)).toMatchObject({
      maxEstimatedCostMicrodollars: '1250000',
    })
    expect(normalizeTeamBudgetUsage({ estimatedCostUsd: 0.5 } as never)).toMatchObject({
      estimatedCostMicrodollars: '500000',
    })
    expect(normalizeAgentResourceLimits({ maxEstimatedCostUsd: 2 } as never)).toMatchObject({
      maxEstimatedCostMicrodollars: '2000000',
    })
  })

  it('migrates legacy persisted team JSON on read without serializing bigint', () => {
    const workspaceRoot = mkdtempSync(path.join(tmpdir(), 'symbolwright-orchestration-money-'))
    roots.push(workspaceRoot)
    const teamDir = path.join(workspaceRoot, '.symbolwright', 'orchestration', 'teams')
    mkdirSync(teamDir, { recursive: true })
    const team = {
      id: 'team-legacy',
      missionId: 'mission-1',
      repositoryRoot: workspaceRoot,
      name: 'Legacy',
      objective: 'Migrate',
      status: 'forming',
      createdBy: 'operator',
      createdAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString(),
      budget: {
        maxTeamSize: 1,
        maxConcurrentAgents: 1,
        maxWallClockMinutes: 1,
        maxSandboxMinutes: 1,
        maxRepairAttempts: 1,
        maxEstimatedCostUsd: 1.5,
      },
      usage: {
        agentRuns: 0,
        wallClockMinutesUsed: 0,
        sandboxMinutesUsed: 0,
        repairAttemptsUsed: 0,
        estimatedCostUsd: 0.25,
        modelTokensUsed: 0,
      },
      metrics: {
        tasksTotal: 0,
        tasksCompleted: 0,
        tasksFailed: 0,
        candidatesSubmitted: 0,
        candidatesAccepted: 0,
        candidatesRejected: 0,
        reviewsCompleted: 0,
        blockingFindingsOpen: 0,
        integrationsExecuted: 0,
        integrationsRolledBack: 0,
      },
      unresolvedRisks: [],
      version: 1,
    }
    writeFileSync(path.join(teamDir, 'team-legacy.json'), JSON.stringify(team))
    const store = new OrchestrationStore({ workspaceRoot })
    const loaded = store.teams.read('team-legacy')
    expect(loaded?.budget.maxEstimatedCostMicrodollars).toBe('1500000')
    expect(loaded?.usage.estimatedCostMicrodollars).toBe('250000')
    store.teams.write('team-legacy', loaded as never)
    expect(readFileSync(path.join(teamDir, 'team-legacy.json'), 'utf8')).not.toContain('CostUsd')
  })
})
