from pathlib import Path
import json
import re

ROOT = Path('.')


def read(relative: str) -> str:
    return (ROOT / relative).read_text()


def write(relative: str, content: str) -> None:
    path = ROOT / relative
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content if content.endswith('\n') else content + '\n')


def replace_once(relative: str, before: str, after: str) -> None:
    path = ROOT / relative
    text = path.read_text()
    if before not in text:
        raise SystemExit(f'Missing anchor in {relative}: {before[:180]!r}')
    path.write_text(text.replace(before, after, 1))


# ---------------------------------------------------------------------------
# Complete the two deliberately deferred PR 4 closure items.
# ---------------------------------------------------------------------------
replace_once(
    'src/orchestration/orchestration-types.ts',
    "import type { ApprovalPolicy, PrincipalType, RepositoryScope } from '../access/access-types.js'",
    "import {\n  parseMicrodollars,\n  serializeMicrodollars,\n  usdToMicrodollars,\n} from '../access/microdollars.js'\nimport type { ApprovalPolicy, PrincipalType, RepositoryScope } from '../access/access-types.js'",
)
replace_once(
    'src/orchestration/orchestration-types.ts',
    """  readonly maxEstimatedCostUsd?: number
""",
    """  /** Canonical base-10 microdollar string at JSON/API boundaries. */
  readonly maxEstimatedCostMicrodollars?: string
""",
)
replace_once(
    'src/orchestration/orchestration-types.ts',
    """  readonly maxEstimatedCostUsd?: number
""",
    """  /** Canonical base-10 microdollar string at JSON/API boundaries. */
  readonly maxEstimatedCostMicrodollars?: string
""",
)
replace_once(
    'src/orchestration/orchestration-types.ts',
    """  estimatedCostUsd: number
""",
    """  estimatedCostMicrodollars: string
""",
)
replace_once(
    'src/orchestration/orchestration-types.ts',
    """    estimatedCostUsd: 0,
""",
    """    estimatedCostMicrodollars: '0',
""",
)
replace_once(
    'src/orchestration/orchestration-types.ts',
    """export interface TeamMetrics {
""",
    """interface LegacyMoneyFields {
  readonly maxEstimatedCostUsd?: unknown
  readonly estimatedCostUsd?: unknown
}

function legacyUsdToSerializedMicrodollars(value: unknown): string | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? serializeMicrodollars(usdToMicrodollars(value))
    : undefined
}

export function normalizeAgentResourceLimits(raw: AgentResourceLimits & LegacyMoneyFields): AgentResourceLimits {
  const legacy = legacyUsdToSerializedMicrodollars(raw.maxEstimatedCostUsd)
  const configured = raw.maxEstimatedCostMicrodollars
  const normalized = configured === undefined ? legacy : serializeMicrodollars(parseMicrodollars(configured))
  const { maxEstimatedCostUsd: _legacy, ...rest } = raw as AgentResourceLimits &
    LegacyMoneyFields & Record<string, unknown>
  return {
    ...rest,
    ...(normalized === undefined ? {} : { maxEstimatedCostMicrodollars: normalized }),
  } as AgentResourceLimits
}

export function normalizeTeamBudget(raw: TeamBudget & LegacyMoneyFields): TeamBudget {
  const legacy = legacyUsdToSerializedMicrodollars(raw.maxEstimatedCostUsd)
  const configured = raw.maxEstimatedCostMicrodollars
  const normalized = configured === undefined ? legacy : serializeMicrodollars(parseMicrodollars(configured))
  const { maxEstimatedCostUsd: _legacy, ...rest } = raw as TeamBudget &
    LegacyMoneyFields & Record<string, unknown>
  return {
    ...rest,
    ...(normalized === undefined ? {} : { maxEstimatedCostMicrodollars: normalized }),
  } as TeamBudget
}

export function normalizeTeamBudgetUsage(
  raw: TeamBudgetUsage & LegacyMoneyFields,
): TeamBudgetUsage {
  const legacy = legacyUsdToSerializedMicrodollars(raw.estimatedCostUsd)
  const configured = raw.estimatedCostMicrodollars
  const normalized = serializeMicrodollars(
    parseMicrodollars(configured ?? legacy ?? '0'),
  )
  const { estimatedCostUsd: _legacy, ...rest } = raw as TeamBudgetUsage &
    LegacyMoneyFields & Record<string, unknown>
  return { ...rest, estimatedCostMicrodollars: normalized } as TeamBudgetUsage
}

export function normalizePersistedAgentTeam(team: AgentTeam): AgentTeam {
  return {
    ...team,
    budget: normalizeTeamBudget(team.budget as TeamBudget & LegacyMoneyFields),
    usage: normalizeTeamBudgetUsage(team.usage as TeamBudgetUsage & LegacyMoneyFields),
  }
}

export function normalizePersistedAgentTeamMember(member: AgentTeamMember): AgentTeamMember {
  return {
    ...member,
    resourceLimits: normalizeAgentResourceLimits(
      member.resourceLimits as AgentResourceLimits & LegacyMoneyFields,
    ),
  }
}

export interface TeamMetrics {
""",
)
replace_once(
    'src/orchestration/orchestration-store.ts',
    "import type { AgentTeam, AgentTeamMember, OrchestrationAuditEvent } from './orchestration-types.js'",
    "import {\n  normalizePersistedAgentTeam,\n  normalizePersistedAgentTeamMember,\n  type AgentTeam,\n  type AgentTeamMember,\n  type OrchestrationAuditEvent,\n} from './orchestration-types.js'",
)
replace_once(
    'src/orchestration/orchestration-store.ts',
    """class AtomicJsonDirectory<T> {
  public constructor(private readonly dir: string) {
""",
    """class AtomicJsonDirectory<T> {
  public constructor(
    private readonly dir: string,
    private readonly normalize: (value: T) => T = (value) => value,
  ) {
""",
)
replace_once(
    'src/orchestration/orchestration-store.ts',
    """      return JSON.parse(readFileSync(targetPath, 'utf8')) as T
""",
    """      return this.normalize(JSON.parse(readFileSync(targetPath, 'utf8')) as T)
""",
)
replace_once(
    'src/orchestration/orchestration-store.ts',
    """          return JSON.parse(readFileSync(previousPath, 'utf8')) as T
""",
    """          return this.normalize(JSON.parse(readFileSync(previousPath, 'utf8')) as T)
""",
)
replace_once(
    'src/orchestration/orchestration-store.ts',
    """    this.teams = new AtomicJsonDirectory(path.join(root, 'teams'))
    this.members = new AtomicJsonDirectory(path.join(root, 'members'))
""",
    """    this.teams = new AtomicJsonDirectory(path.join(root, 'teams'), normalizePersistedAgentTeam)
    this.members = new AtomicJsonDirectory(
      path.join(root, 'members'),
      normalizePersistedAgentTeamMember,
    )
""",
)
replace_once(
    'src/orchestration/team-service.ts',
    """      budget: { ...DEFAULT_TEAM_BUDGET, ...input.budget },
""",
    """      budget: normalizeTeamBudget({ ...DEFAULT_TEAM_BUDGET, ...input.budget }),
""",
)
replace_once(
    'src/orchestration/team-service.ts',
    """  type TeamBudget,
  type TeamStatus,
""",
    """  normalizeAgentResourceLimits,
  normalizeTeamBudget,
  type TeamBudget,
  type TeamStatus,
""",
)
replace_once(
    'src/orchestration/team-service.ts',
    """      resourceLimits: input.resourceLimits ?? {},
""",
    """      resourceLimits: normalizeAgentResourceLimits(input.resourceLimits ?? {}),
""",
)

# Wire the executor's existing budget cancellation hook into the real server runtime.
replace_once(
    'src/autonomy/autonomous-mission-coordinator.ts',
    "import type { AccessRuntime } from '../access/access-runtime.js'",
    "import type { AccessRuntime } from '../access/access-runtime.js'\nimport type { GovernanceStore } from '../access/governance-store.js'\nimport { usdToMicrodollars } from '../access/microdollars.js'",
)
replace_once(
    'src/autonomy/autonomous-mission-coordinator.ts',
    """  readonly accessRuntime?: AccessRuntime
""",
    """  readonly accessRuntime?: AccessRuntime
  /** Lazy to preserve local zero-side-effect startup when no delegated mission has a cost cap. */
  readonly getGovernanceStore?: () => GovernanceStore
""",
)
replace_once(
    'src/autonomy/autonomous-mission-coordinator.ts',
    """  readonly #accessRuntime: AccessRuntime | undefined
  readonly #abortRegistry: MissionExecutionAbortRegistry
""",
    """  readonly #accessRuntime: AccessRuntime | undefined
  readonly #getGovernanceStore: (() => GovernanceStore) | undefined
  readonly #abortRegistry: MissionExecutionAbortRegistry
""",
)
replace_once(
    'src/autonomy/autonomous-mission-coordinator.ts',
    """    this.#accessRuntime = options.accessRuntime
    this.#abortRegistry = options.abortRegistry ?? new MissionExecutionAbortRegistry()
""",
    """    this.#accessRuntime = options.accessRuntime
    this.#getGovernanceStore = options.getGovernanceStore
    this.#abortRegistry = options.abortRegistry ?? new MissionExecutionAbortRegistry()
""",
)
replace_once(
    'src/autonomy/autonomous-mission-coordinator.ts',
    """      const maxDurationMinutes = this.#resolveMaxDurationMinutes(mission)
      const execution = await this.#executor.start(plan.graph, {
        ...(maxDurationMinutes === undefined ? {} : { maxDurationMinutes }),
        signal: registration.signal,
      })
""",
    """      const maxDurationMinutes = this.#resolveMaxDurationMinutes(mission)
      const isBudgetExceeded = this.#budgetExceededPredicate(mission)
      const execution = await this.#executor.start(plan.graph, {
        ...(maxDurationMinutes === undefined ? {} : { maxDurationMinutes }),
        ...(isBudgetExceeded === undefined ? {} : { isBudgetExceeded }),
        signal: registration.signal,
      })
""",
)
replace_once(
    'src/autonomy/autonomous-mission-coordinator.ts',
    """      const maxDurationMinutes = this.#resolveMaxDurationMinutes(mission)
      const execution = await this.#executor.resume(missionId, {
        ...(maxDurationMinutes === undefined ? {} : { maxDurationMinutes }),
        signal: registration.signal,
      })
""",
    """      const maxDurationMinutes = this.#resolveMaxDurationMinutes(mission)
      const isBudgetExceeded = this.#budgetExceededPredicate(mission)
      const execution = await this.#executor.resume(missionId, {
        ...(maxDurationMinutes === undefined ? {} : { maxDurationMinutes }),
        ...(isBudgetExceeded === undefined ? {} : { isBudgetExceeded }),
        signal: registration.signal,
      })
""",
)
replace_once(
    'src/autonomy/autonomous-mission-coordinator.ts',
    """  async status(missionId: string): Promise<MissionDashboardProjection> {
""",
    """  #budgetExceededPredicate(
    mission: SymbolWrightMission,
  ): (() => boolean) | undefined {
    if (
      mission.grantId === undefined ||
      this.#accessRuntime === undefined ||
      this.#getGovernanceStore === undefined
    ) {
      return undefined
    }
    const capUsd = this.#accessRuntime.grantService.getGrant(mission.grantId)?.executionLimits
      .maxDailyEstimatedCostUsd
    if (capUsd === undefined) return undefined
    const cap = usdToMicrodollars(capUsd)
    return () =>
      this.#getGovernanceStore?.().getGrantDailyUsageMicrodollars(mission.grantId as string) >= cap
  }

  async status(missionId: string): Promise<MissionDashboardProjection> {
""",
)
replace_once(
    'src/autonomy/autonomous-mission-runtime.ts',
    "import type { AccessRuntime } from '../access/access-runtime.js'",
    "import type { AccessRuntime } from '../access/access-runtime.js'\nimport type { GovernanceStore } from '../access/governance-store.js'",
)
replace_once(
    'src/autonomy/autonomous-mission-runtime.ts',
    """  readonly accessRuntime?: AccessRuntime
  readonly now?: () => Date
""",
    """  readonly accessRuntime?: AccessRuntime
  readonly getGovernanceStore?: () => GovernanceStore
  readonly now?: () => Date
""",
)
replace_once(
    'src/autonomy/autonomous-mission-runtime.ts',
    """    ...(options.accessRuntime === undefined ? {} : { accessRuntime: options.accessRuntime }),
    multiAgentTracker,
""",
    """    ...(options.accessRuntime === undefined ? {} : { accessRuntime: options.accessRuntime }),
    ...(options.getGovernanceStore === undefined
      ? {}
      : { getGovernanceStore: options.getGovernanceStore }),
    multiAgentTracker,
""",
)
replace_once(
    'src/autonomy/server-autonomy-runtime.ts',
    "import type { AccessRuntime } from '../access/access-runtime.js'",
    "import type { AccessRuntime } from '../access/access-runtime.js'\nimport type { GovernanceStore } from '../access/governance-store.js'",
)
replace_once(
    'src/autonomy/server-autonomy-runtime.ts',
    """  readonly accessRuntime?: AccessRuntime
  /** Global fallback mission-duration cap (minutes); see `accessRuntime` for the per-grant
""",
    """  readonly accessRuntime?: AccessRuntime
  readonly getGovernanceStore?: () => GovernanceStore
  /** Global fallback mission-duration cap (minutes); see `accessRuntime` for the per-grant
""",
)
replace_once(
    'src/autonomy/server-autonomy-runtime.ts',
    """    ...(options.accessRuntime === undefined ? {} : { accessRuntime: options.accessRuntime }),
  })
""",
    """    ...(options.accessRuntime === undefined ? {} : { accessRuntime: options.accessRuntime }),
    ...(options.getGovernanceStore === undefined
      ? {}
      : { getGovernanceStore: options.getGovernanceStore }),
  })
""",
)
replace_once(
    'src/app/api/mission-routes.ts',
    "import type { AccessRuntime } from '../../access/access-runtime.js'",
    "import type { AccessRuntime } from '../../access/access-runtime.js'\nimport type { GovernanceStore } from '../../access/governance-store.js'",
)
replace_once(
    'src/app/api/mission-routes.ts',
    """  readonly accessRuntime?: AccessRuntime
""",
    """  readonly accessRuntime?: AccessRuntime
  readonly getGovernanceStore?: () => GovernanceStore
""",
)
replace_once(
    'src/app/api/mission-routes.ts',
    """    ...(context.accessRuntime === undefined ? {} : { accessRuntime: context.accessRuntime }),
  })
""",
    """    ...(context.accessRuntime === undefined ? {} : { accessRuntime: context.accessRuntime }),
    ...(context.getGovernanceStore === undefined
      ? {}
      : { getGovernanceStore: context.getGovernanceStore }),
  })
""",
)
replace_once(
    'src/server/symbolwright-chat-server.ts',
    """    accessRuntime,
    teamSource: teamVisibilitySource,
    shutdownLifecycle,
""",
    """    accessRuntime,
    getGovernanceStore,
    teamSource: teamVisibilitySource,
    shutdownLifecycle,
""",
)

write(
    'src/orchestration/orchestration-money.spec.ts',
    """import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
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
      id: 'team-legacy', missionId: 'mission-1', repositoryRoot: workspaceRoot,
      name: 'Legacy', objective: 'Migrate', status: 'forming', createdBy: 'operator',
      createdAt: new Date(0).toISOString(), updatedAt: new Date(0).toISOString(),
      budget: { maxTeamSize: 1, maxConcurrentAgents: 1, maxWallClockMinutes: 1,
        maxSandboxMinutes: 1, maxRepairAttempts: 1, maxEstimatedCostUsd: 1.5 },
      usage: { agentRuns: 0, wallClockMinutesUsed: 0, sandboxMinutesUsed: 0,
        repairAttemptsUsed: 0, estimatedCostUsd: 0.25, modelTokensUsed: 0 },
      metrics: { tasksTotal: 0, tasksCompleted: 0, tasksFailed: 0,
        candidatesSubmitted: 0, candidatesAccepted: 0, candidatesRejected: 0,
        reviewsCompleted: 0, blockingFindingsOpen: 0, integrationsExecuted: 0,
        integrationsRolledBack: 0 }, unresolvedRisks: [], version: 1,
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
""",
)

write(
    'src/autonomy/autonomous-budget-governance.spec.ts',
    """import { mkdtempSync, rmSync } from 'node:fs'
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
    const missionService = new MissionService({ workspaceRoot, env: {} })
    const accessRuntime = new AccessRuntime({ workspaceRoot })
    const { grant } = accessRuntime.grantService.createGrant({
      principalType: 'service', displayName: 'Budgeted', issuedBy: 'operator',
      profileId: 'coding-agent', repositoryScope: { mode: 'single', repositories: [], organizations: [] },
      executionLimits: { maxDailyEstimatedCostUsd: 1 }, reason: 'test', issueTokenNow: false,
    })
    const mission = missionService.create({
      name: 'Budget stop', objective: 'Do no provider work', repositoryRoot: workspaceRoot,
      runtimeMode: 'APPROVED_EXECUTION', grantId: grant.id,
    })
    const governance = new GovernanceStore(path.join(workspaceRoot, 'governance.db'))
    const reservation = governance.reserveUsage({
      grantScope: `grant:${grant.id}`, grantId: grant.id,
      reservedMicrodollars: usdToMicrodollars(1),
    })
    governance.settleReservation(reservation.reservationId, usdToMicrodollars(1))
    let calls = 0
    const runtime = createAutonomousMissionRuntime({
      workspaceRoot, missionService, accessRuntime, getGovernanceStore: () => governance,
      taskExecutor: { async execute() { calls += 1; return { status: 'completed', summary: 'done' } } },
      validationCommands: ['npm test'],
    })
    const result = await runtime.coordinator.start(mission.id)
    expect(calls).toBe(0)
    expect(result.execution.status).toBe('cancelled')
    expect(result.execution.cancellationReason).toBe('budget')
    governance.close()
  })
})
""",
)

# ---------------------------------------------------------------------------
# Release preparation, immutable verification, and real artifact smoke gates.
# ---------------------------------------------------------------------------
write(
    'scripts/lib/changelog-release.mjs',
    """const VERSION_PATTERN = /^(0|[1-9]\\d*)\\.(0|[1-9]\\d*)\\.(0|[1-9]\\d*)(?:-[0-9A-Za-z.-]+)?(?:\\+[0-9A-Za-z.-]+)?$/

export function assertReleaseVersion(version) {
  if (typeof version !== 'string' || !VERSION_PATTERN.test(version)) {
    throw new Error(`Release version must be valid SemVer without a leading v: ${String(version)}`)
  }
}

export function extractUnreleasedBody(content) {
  const match = content.match(/## \\[Unreleased\\]\\s*\\n([\\s\\S]*?)(?=\\n## \\[|$)/)
  if (!match) throw new Error('CHANGELOG.md is missing ## [Unreleased].')
  return match[1].trim()
}

export function prepareChangelogRelease(content, version, date) {
  assertReleaseVersion(version)
  if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(date)) throw new Error(`Release date is invalid: ${date}`)
  if (content.includes(`## [${version}]`)) throw new Error(`CHANGELOG.md already contains ${version}.`)
  const body = extractUnreleasedBody(content)
  if (body.length === 0) throw new Error('The Unreleased changelog section is empty.')
  const replacement = `## [Unreleased]\\n\\n## [${version}] - ${date}\\n\\n${body}\\n`
  return content.replace(/## \\[Unreleased\\]\\s*\\n[\\s\\S]*?(?=\\n## \\[|$)/, replacement.trimEnd())
}

export function extractReleaseNotes(content, version) {
  assertReleaseVersion(version)
  const escaped = version.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')
  const match = content.match(new RegExp(`## \\[${escaped}\\](?: - \\d{4}-\\d{2}-\\d{2})?\\s*\\n([\\s\\S]*?)(?=\\n## \\[|$)`))
  if (!match || match[1].trim().length === 0) throw new Error(`No release notes found for ${version}.`)
  return match[1].trim() + '\\n'
}
""",
)
write(
    'scripts/lib/changelog-release.test.mjs',
    """import assert from 'node:assert/strict'
import test from 'node:test'
import { extractReleaseNotes, prepareChangelogRelease } from './changelog-release.mjs'

test('promotes Unreleased into a dated release and leaves a fresh empty Unreleased section', () => {
  const result = prepareChangelogRelease('# Changelog\\n\\n## [Unreleased]\\n\\n### Fixed\\n\\n- One.\\n\\n## [0.1.0] - 2026-01-01\\n\\nOld.\\n', '0.2.0', '2026-07-27')
  assert.match(result, /## \\[Unreleased\\]\\n\\n## \\[0\\.2\\.0\\] - 2026-07-27/)
  assert.equal(extractReleaseNotes(result, '0.2.0'), '### Fixed\\n\\n- One.\\n')
})

test('refuses an empty Unreleased section', () => {
  assert.throws(() => prepareChangelogRelease('# Changelog\\n\\n## [Unreleased]\\n', '1.0.0', '2026-07-27'), /empty/)
})
""",
)
write(
    'scripts/extract-release-notes.mjs',
    """import fs from 'node:fs'
import { extractReleaseNotes } from './lib/changelog-release.mjs'

const version = process.argv[2] ?? JSON.parse(fs.readFileSync('package.json', 'utf8')).version
process.stdout.write(extractReleaseNotes(fs.readFileSync('CHANGELOG.md', 'utf8'), version))
""",
)
write(
    'scripts/verify-release-tag.mjs',
    """import fs from 'node:fs'
import { extractReleaseNotes } from './lib/changelog-release.mjs'

const raw = process.argv[2] ?? process.env.GITHUB_REF_NAME
if (!raw) throw new Error('A release tag is required.')
const version = raw.startsWith('v') ? raw.slice(1) : raw
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'))
const lock = JSON.parse(fs.readFileSync('package-lock.json', 'utf8'))
if (pkg.version !== version) throw new Error(`Tag ${raw} does not match package.json ${pkg.version}.`)
if (lock.version !== version || lock.packages?.['']?.version !== version) {
  throw new Error(`Tag ${raw} does not match package-lock.json.`)
}
extractReleaseNotes(fs.readFileSync('CHANGELOG.md', 'utf8'), version)
console.log(`Release tag ${raw} matches package, lockfile, and changelog.`)
""",
)
write(
    'scripts/release-prepare.mjs',
    """import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import { prepareChangelogRelease, extractReleaseNotes, assertReleaseVersion } from './lib/changelog-release.mjs'

const version = process.argv[2]
assertReleaseVersion(version)
const status = spawnSync('git', ['status', '--porcelain'], { encoding: 'utf8' })
if (status.status !== 0 || status.stdout.trim().length > 0) throw new Error('release:prepare requires a clean working tree.')
const paths = ['CHANGELOG.md', 'package.json', 'package-lock.json']
const backups = Object.fromEntries(paths.map((path) => [path, fs.readFileSync(path)]))
try {
  const date = new Date().toISOString().slice(0, 10)
  fs.writeFileSync('CHANGELOG.md', prepareChangelogRelease(backups['CHANGELOG.md'].toString('utf8'), version, date))
  const bump = spawnSync('npm', ['version', version, '--no-git-tag-version', '--ignore-scripts'], { stdio: 'inherit' })
  if (bump.status !== 0) throw new Error('npm version failed.')
  extractReleaseNotes(fs.readFileSync('CHANGELOG.md', 'utf8'), version)
  const validate = spawnSync('npm', ['run', 'validate'], { stdio: 'inherit', env: process.env })
  if (validate.status !== 0) throw new Error('Release validation failed.')
  console.log(`Prepared ${version}. Review and commit the deliberate package/lock/changelog diff before tagging.`)
} catch (error) {
  for (const [path, content] of Object.entries(backups)) fs.writeFileSync(path, content)
  throw error
}
""",
)
write(
    'src/release/artifact-smoke.ts',
    """import { randomUUID } from 'node:crypto'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

export interface ArtifactSmokeResult { readonly status: 'PASS' | 'SKIP' | 'FAIL'; readonly detail: string }

function commandExists(command: string): boolean {
  return spawnSync(command, ['--version'], { stdio: 'ignore' }).status === 0
}

function run(command: string, args: readonly string[], options: { cwd?: string; env?: NodeJS.ProcessEnv } = {}): string {
  return execFileSync(command, args, { cwd: options.cwd, env: options.env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
}

export function runNpmPackSmoke(workspaceRoot: string): ArtifactSmokeResult {
  const root = mkdtempSync(path.join(tmpdir(), 'symbolwright-pack-smoke-'))
  try {
    const packDir = path.join(root, 'pack'); const projectDir = path.join(root, 'project')
    mkdirSync(packDir); mkdirSync(projectDir)
    writeFileSync(path.join(projectDir, 'package.json'), JSON.stringify({ private: true }))
    const packed = JSON.parse(run('npm', ['pack', '--json', '--pack-destination', packDir], { cwd: workspaceRoot })) as { filename: string }[]
    const tarball = path.join(packDir, packed[0]?.filename ?? '')
    run('npm', ['install', '--ignore-scripts', tarball], { cwd: projectDir })
    for (const bin of ['symbolwright', 'symbolwright-workspace', 'codemind', 'codemind-workspace']) {
      run(path.join(projectDir, 'node_modules', '.bin', bin), ['--help'], { cwd: projectDir })
    }
    return { status: 'PASS', detail: 'Packed tarball installed in a fresh project and all canonical/compatibility bins executed.' }
  } catch (error) {
    return { status: 'FAIL', detail: error instanceof Error ? error.message : String(error) }
  } finally { rmSync(root, { recursive: true, force: true }) }
}

function availablePort(): number {
  const script = "const n=require('node:net');const s=n.createServer();s.listen(0,'127.0.0.1',()=>{console.log(s.address().port);s.close()})"
  return Number(run(process.execPath, ['-e', script]))
}

function curl(url: string, apiKey?: string): void {
  const args = ['--fail', '--silent', '--show-error', '--max-time', '2', '--insecure']
  if (apiKey !== undefined) args.push('-H', `Authorization: Bearer ${apiKey}`)
  args.push(url)
  run('curl', args)
}

function waitFor(url: string, apiKey?: string): void {
  const deadline = Date.now() + 30_000
  let last: unknown
  while (Date.now() < deadline) {
    try { curl(url, apiKey); return } catch (error) { last = error; Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 250) }
  }
  throw last instanceof Error ? last : new Error(`Timed out waiting for ${url}`)
}

function smokeProfile(image: string, profile: 'local' | 'hosted'): void {
  const name = `symbolwright-smoke-${profile}-${randomUUID()}`
  const state = mkdtempSync(path.join(tmpdir(), `symbolwright-${profile}-state-`))
  const certs = mkdtempSync(path.join(tmpdir(), `symbolwright-${profile}-certs-`))
  const port = availablePort(); const key = 'release-smoke-key'
  try {
    const env = ['-e', `SYMBOLWRIGHT_API_KEY=${key}`, '-e', 'SYMBOLWRIGHT_HOST=0.0.0.0', '-e', 'SYMBOLWRIGHT_PORT=8787']
    const mounts = ['-v', `${state}:/data`]
    let scheme = 'http'
    if (profile === 'local') {
      env.push('-e', 'SYMBOLWRIGHT_DEPLOYMENT_MODE=local', '-e', 'SYMBOLWRIGHT_ALLOW_UNENCRYPTED_NON_LOOPBACK=true')
    } else {
      if (!commandExists('openssl')) throw new Error('openssl is required for hosted Docker smoke.')
      run('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-subj', '/CN=localhost', '-keyout', path.join(certs, 'key.pem'), '-out', path.join(certs, 'cert.pem'), '-days', '1'])
      mounts.push('-v', `${certs}:/certs:ro`); scheme = 'https'
      env.push('-e', 'SYMBOLWRIGHT_DEPLOYMENT_MODE=hosted', '-e', 'SYMBOLWRIGHT_TLS_CERT_FILE=/certs/cert.pem', '-e', 'SYMBOLWRIGHT_TLS_KEY_FILE=/certs/key.pem', '-e', 'SYMBOLWRIGHT_MAX_PROVIDER_CONCURRENCY=2', '-e', 'SYMBOLWRIGHT_MAX_SSE_STREAMS=2', '-e', 'SYMBOLWRIGHT_MAX_AUTONOMOUS_EXECUTIONS=1')
    }
    run('docker', ['run', '--detach', '--name', name, '-p', `127.0.0.1:${port}:8787`, ...mounts, ...env, image, 'serve'])
    waitFor(`${scheme}://127.0.0.1:${port}/api/health`)
    waitFor(`${scheme}://127.0.0.1:${port}/readyz`)
    waitFor(`${scheme}://127.0.0.1:${port}/api/metrics`, key)
    if (run('docker', ['exec', name, 'id', '-u']) === '0') throw new Error('Container runs as root.')
    run('docker', ['exec', name, 'sh', '-c', 'test -w /data && touch /data/.release-smoke'])
    run('docker', ['kill', '--signal=TERM', name])
    const deadline = Date.now() + 15_000
    while (Date.now() < deadline && run('docker', ['inspect', '-f', '{{.State.Running}}', name]) === 'true') {
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 250)
    }
    if (run('docker', ['inspect', '-f', '{{.State.Running}}', name]) === 'true') throw new Error('Container did not stop after SIGTERM.')
    if (run('docker', ['inspect', '-f', '{{.State.ExitCode}}', name]) !== '0') throw new Error('Container exited non-zero after SIGTERM.')
  } finally {
    spawnSync('docker', ['rm', '-f', name], { stdio: 'ignore' })
    rmSync(state, { recursive: true, force: true }); rmSync(certs, { recursive: true, force: true })
  }
}

export function runDockerSmoke(workspaceRoot: string, imageOverride?: string): ArtifactSmokeResult {
  const required = process.env['SYMBOLWRIGHT_REQUIRE_DOCKER_SMOKE'] === '1'
  if (!commandExists('docker')) return required ? { status: 'FAIL', detail: 'Docker is required but unavailable.' } : { status: 'SKIP', detail: 'Docker unavailable; smoke skipped outside strict release CI.' }
  const image = imageOverride ?? `symbolwright-release-smoke:${randomUUID()}`
  try {
    if (imageOverride === undefined) run('docker', ['build', '--tag', image, '.'], { cwd: workspaceRoot })
    smokeProfile(image, 'local'); smokeProfile(image, 'hosted')
    return { status: 'PASS', detail: 'Local artifact and hosted TLS profiles passed health, readiness, auth, non-root, writable-state, and SIGTERM checks.' }
  } catch (error) {
    return { status: 'FAIL', detail: error instanceof Error ? error.message : String(error) }
  } finally {
    if (imageOverride === undefined) spawnSync('docker', ['image', 'rm', '-f', image], { stdio: 'ignore' })
  }
}
""",
)
write(
    'scripts/docker-smoke.mjs',
    """const args = process.argv.slice(2)
const imageIndex = args.indexOf('--image')
const image = imageIndex >= 0 ? args[imageIndex + 1] : undefined
const { runDockerSmoke } = await import('../dist/release/artifact-smoke.js')
const result = runDockerSmoke(process.cwd(), image)
console.log(`[${result.status}] ${result.detail}`)
if (result.status === 'FAIL') process.exitCode = 1
""",
)

# Release readiness gets executable artifact gates; library tests can turn them off explicitly.
replace_once(
    'src/cli-release-readiness.ts',
    "import { assessRuntimeModeTruth } from './runtime/runtime-mode-truth-gate.js'",
    "import { assessRuntimeModeTruth } from './runtime/runtime-mode-truth-gate.js'\nimport { runDockerSmoke, runNpmPackSmoke } from './release/artifact-smoke.js'",
)
replace_once(
    'src/cli-release-readiness.ts',
    """  | 'BUILD_LEDGER_CONSISTENT'
""",
    """  | 'BUILD_LEDGER_CONSISTENT'
  | 'NPM_PACK_SMOKE'
  | 'DOCKER_RUNTIME_SMOKE'
""",
)
replace_once(
    'src/cli-release-readiness.ts',
    """export function assessReleaseReadiness(workspaceRoot: string): ReleaseReadinessReport {
""",
    """export interface ReleaseReadinessOptions {
  readonly runArtifactSmoke?: boolean
}

export function assessReleaseReadiness(
  workspaceRoot: string,
  options: ReleaseReadinessOptions = {},
): ReleaseReadinessReport {
""",
)
replace_once(
    'src/cli-release-readiness.ts',
    """    checkBuildLedgerConsistent(workspaceRoot),
  ]
""",
    """    checkBuildLedgerConsistent(workspaceRoot),
  ]
  if (options.runArtifactSmoke === true) {
    const pack = runNpmPackSmoke(workspaceRoot)
    gates.push({ code: 'NPM_PACK_SMOKE', status: pack.status === 'PASS' ? 'PASS' : 'FAIL', detail: pack.detail })
    const docker = runDockerSmoke(workspaceRoot)
    gates.push({ code: 'DOCKER_RUNTIME_SMOKE', status: docker.status === 'FAIL' ? 'FAIL' : 'PASS', detail: docker.detail })
  } else {
    gates.push(
      { code: 'NPM_PACK_SMOKE', status: 'PASS', detail: 'Deferred by library caller; release-readiness CLI runs the real gate.' },
      { code: 'DOCKER_RUNTIME_SMOKE', status: 'PASS', detail: 'Deferred by library caller; release-readiness CLI runs the real gate.' },
    )
  }
""",
)
replace_once(
    'src/cli-release-readiness.ts',
    """  const report = assessReleaseReadiness(workspaceRoot)
""",
    """  const report = assessReleaseReadiness(workspaceRoot, { runArtifactSmoke: true })
""",
)
replace_once(
    'src/cli-release-readiness.spec.ts',
    """    expect(codes).toContain('BUILD_LEDGER_CONSISTENT')
""",
    """    expect(codes).toContain('BUILD_LEDGER_CONSISTENT')
    expect(codes).toContain('NPM_PACK_SMOKE')
    expect(codes).toContain('DOCKER_RUNTIME_SMOKE')
""",
)

# Docker image must give the non-root process a real writable state root.
replace_once(
    'Dockerfile',
    """RUN groupadd --gid 1001 symbolwright \\
  && useradd --uid 1001 --gid 1001 --create-home --shell /usr/sbin/nologin symbolwright

COPY --from=build /app/dist ./dist
""",
    """RUN groupadd --gid 1001 symbolwright \\
  && useradd --uid 1001 --gid 1001 --create-home --shell /usr/sbin/nologin symbolwright \\
  && mkdir -p /data \\
  && chown symbolwright:symbolwright /data

COPY --from=build /app/dist ./dist
""",
)
replace_once(
    'Dockerfile',
    """USER symbolwright
EXPOSE 8787
VOLUME [\"/data\"]
""",
    """USER symbolwright
WORKDIR /data
EXPOSE 8787
VOLUME [\"/data\"]
""",
)
replace_once(
    'Dockerfile',
    'ENTRYPOINT ["node", "dist/cli.js"]',
    'ENTRYPOINT ["node", "/app/dist/cli.js"]',
)

# Package scripts and native node:test coverage for release tooling.
pkg_path = ROOT / 'package.json'
pkg = json.loads(pkg_path.read_text())
pkg['scripts']['release:prepare'] = 'node scripts/release-prepare.mjs'
pkg['scripts']['release:verify-tag'] = 'node scripts/verify-release-tag.mjs'
pkg['scripts']['release:notes'] = 'node scripts/extract-release-notes.mjs'
pkg['scripts']['release:docker-smoke'] = 'node scripts/docker-smoke.mjs'
pkg['scripts']['test:release-scripts'] = 'node --test scripts/lib/changelog-release.test.mjs'
pkg['scripts']['validate'] = pkg['scripts']['validate'].replace('npm run typecheck', 'npm run test:release-scripts && npm run typecheck')
pkg_path.write_text(json.dumps(pkg, indent=2) + '\n')

# Workflows: immutable verification, strict smoke, exact pushed digest validation.
replace_once(
    '.github/workflows/publish.yml',
    """      - name: Run release validation
        run: npm run validate
""",
    """      - name: Verify immutable tag inputs
        run: npm run release:verify-tag -- \"${{ steps.release_meta.outputs.tag }}\"

      - name: Run release validation
        env:
          SYMBOLWRIGHT_REQUIRE_DOCKER_SMOKE: '1'
        run: npm run validate
""",
)
replace_once(
    '.github/workflows/deploy.yml',
    """      - name: Run release validation
        run: npm run validate
""",
    """      - name: Run release validation
        env:
          SYMBOLWRIGHT_REQUIRE_DOCKER_SMOKE: '1'
        run: npm run validate
""",
)
replace_once(
    '.github/workflows/deploy.yml',
    """      - name: Build and push Docker image
        uses: docker/build-push-action@6941d19a02a085e22e607b4bd1b4ac46ff9df7d1 # v6.18.0
""",
    """      - name: Build and push Docker image
        id: build
        uses: docker/build-push-action@6941d19a02a085e22e607b4bd1b4ac46ff9df7d1 # v6.18.0
""",
)
replace_once(
    '.github/workflows/deploy.yml',
    """      - name: Write deployment summary
""",
    """      - name: Pull and smoke-test the exact pushed digest
        env:
          SYMBOLWRIGHT_REQUIRE_DOCKER_SMOKE: '1'
        run: |
          image=\"${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}@${{ steps.build.outputs.digest }}\"
          docker pull \"$image\"
          npm run release:docker-smoke -- --image \"$image\"

      - name: Write deployment summary
""",
)

# Focused changelog entry only.
replace_once(
    'CHANGELOG.md',
    '### Fixed\n\n',
    """### Fixed

- **Release integrity, artifact smoke, and remaining governance closure (Bundle #12 PR 6)**:
  adds human-only clean-tree `release:prepare`, immutable tag/package/lock/changelog verification,
  real packed-tarball bin execution, mandatory local and hosted Docker boot smoke in release CI,
  exact GHCR digest pullback verification, a writable non-root container state root, fixed-point
  orchestration budget persistence with legacy migration, and live autonomous budget-stop wiring to
  the durable governance ledger.
""",
)
