import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { AccessRuntime } from '../access/access-runtime.js'
import type { RepositoryScope } from '../access/access-types.js'
import { MissionService } from '../mission/mission-service.js'
import type { SymbolWrightMission } from '../mission/mission-types.js'
import {
  createServerAutonomyRuntime,
  DEFAULT_AUTONOMOUS_VALIDATION_COMMANDS,
  resolveMaxRepairAttempts,
} from './server-autonomy-runtime.js'

function service(): MissionService {
  return new MissionService({ workspaceRoot: '/tmp/symbolwright-autonomy-runtime-test', env: {} })
}

describe('createServerAutonomyRuntime', () => {
  it('assembles coordinator, controls, execution persistence, and executor', () => {
    const runtime = createServerAutonomyRuntime({
      workspaceRoot: '/tmp/symbolwright-autonomy-runtime-test',
      missionService: service(),
      hasGitHubToken: false,
    })

    expect(runtime.coordinator).toBeDefined()
    expect(runtime.control).toBeDefined()
    expect(runtime.executionStore).toBeDefined()
    expect(runtime.executor).toBeDefined()
  })

  it('provides the full default validation sequence', () => {
    expect(DEFAULT_AUTONOMOUS_VALIDATION_COMMANDS).toEqual([
      'npm run typecheck',
      'npm run lint',
      'npm test',
      'npm run build',
    ])
  })

  it('accepts a real edit executor and custom validation commands', () => {
    const runtime = createServerAutonomyRuntime({
      workspaceRoot: '/tmp/symbolwright-autonomy-runtime-test',
      missionService: service(),
      hasGitHubToken: true,
      validationCommands: ['npm run validate'],
      editExecutor: {
        async execute() {
          return { state: 'completed', modifiedFiles: ['src/example.ts'] }
        },
      },
    })

    expect(runtime.executor).toBeDefined()
  })
})

describe('resolveMaxRepairAttempts', () => {
  let root: string
  let accessRuntime: AccessRuntime
  let missionService: MissionService

  const REPO_SCOPE: RepositoryScope = {
    mode: 'installation',
    repositories: [],
    organizations: [],
  }

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'symbolwright-repair-attempts-test-'))
    accessRuntime = new AccessRuntime({ workspaceRoot: root })
    missionService = new MissionService({ workspaceRoot: root, env: {} })
  })

  afterEach(() => rmSync(root, { recursive: true, force: true }))

  async function missionWithGrantId(grantId?: string): Promise<SymbolWrightMission> {
    return missionService.create(
      {
        name: 'Mission',
        objective: 'Repair',
        workspaceKind: 'repository',
        repositoryPath: '.',
        runtimeMode: 'READ_ONLY',
        labels: [],
      },
      grantId === undefined ? {} : { grantId },
    )
  }

  it('falls back to the global cap when the mission has no grant', async () => {
    const mission = await missionWithGrantId()
    expect(resolveMaxRepairAttempts(mission, { maxRepairAttempts: 4, accessRuntime })).toBe(4)
  })

  it('returns undefined when neither a global nor a grant cap is set', async () => {
    const mission = await missionWithGrantId()
    expect(resolveMaxRepairAttempts(mission, {})).toBeUndefined()
  })

  it("uses the grant's cap when the global option is unset", async () => {
    const { grant } = accessRuntime.grantService.createGrant({
      principalType: 'coding-agent',
      displayName: 'Coder',
      issuedBy: 'operator-1',
      profileId: 'coding-agent',
      repositoryScope: REPO_SCOPE,
      executionLimits: { maxRepairAttempts: 2 },
    })
    const mission = await missionWithGrantId(grant.id)
    expect(resolveMaxRepairAttempts(mission, { accessRuntime })).toBe(2)
  })

  it('takes the smaller of the global and grant caps — a grant can only tighten, never loosen', async () => {
    const { grant } = accessRuntime.grantService.createGrant({
      principalType: 'coding-agent',
      displayName: 'Coder',
      issuedBy: 'operator-1',
      profileId: 'coding-agent',
      repositoryScope: REPO_SCOPE,
      executionLimits: { maxRepairAttempts: 1 },
    })
    const mission = await missionWithGrantId(grant.id)
    expect(resolveMaxRepairAttempts(mission, { maxRepairAttempts: 5, accessRuntime })).toBe(1)
    expect(resolveMaxRepairAttempts(mission, { maxRepairAttempts: 0, accessRuntime })).toBe(0)
  })

  it('clamps an out-of-range grant cap to the [0, 10] range instead of passing it through raw', async () => {
    const { grant } = accessRuntime.grantService.createGrant({
      principalType: 'coding-agent',
      displayName: 'Coder',
      issuedBy: 'operator-1',
      profileId: 'coding-agent',
      repositoryScope: REPO_SCOPE,
      executionLimits: { maxRepairAttempts: 500 },
    })
    const mission = await missionWithGrantId(grant.id)
    expect(resolveMaxRepairAttempts(mission, { accessRuntime })).toBe(10)
  })

  it('ignores the grant when accessRuntime is not supplied, even if the mission has a grantId', async () => {
    const mission = await missionWithGrantId('some-grant-id')
    expect(resolveMaxRepairAttempts(mission, { maxRepairAttempts: 3 })).toBe(3)
  })
})
