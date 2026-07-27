import { randomUUID } from 'node:crypto'

import type { AccessRuntime } from '../access/access-runtime.js'
import type { RepositoryScope } from '../access/access-types.js'
import type { OrchestrationStore } from './orchestration-store.js'
import {
  DEFAULT_TEAM_BUDGET,
  zeroBudgetUsage,
  zeroTeamMetrics,
  type AgentTeam,
  type AgentTeamMember,
  type CreateTeamMemberInput,
  type OrchestrationAuditEvent,
  type OrchestrationAuditEventType,
  type TeamBudget,
  type TeamStatus,
} from './orchestration-types.js'

export class TeamValidationError extends Error {}
export class TeamNotFoundError extends Error {}
export class TeamBudgetExceededError extends Error {}

export interface CreateTeamInput {
  readonly missionId: string
  readonly repositoryRoot: string
  readonly name: string
  readonly objective: string
  readonly createdBy: string
  readonly budget?: Partial<TeamBudget>
  /** The authenticated caller's grant/principal, when created by a delegated agent -- recorded
   * as the team's owner. Never sourced from the request body (see `AgentTeam.ownerGrantId`). */
  readonly ownerGrantId?: string
  readonly ownerPrincipalId?: string
}

/**
 * Valid `AgentTeam.status` transitions (Section 5/30). Every transition not listed here is
 * refused — fail closed rather than allow an ambiguous jump (e.g. `forming` straight to
 * `completed`, skipping the mission-completion gate in `integration-engine.ts`).
 */
const ALLOWED_TRANSITIONS: Readonly<Record<TeamStatus, readonly TeamStatus[]>> = {
  forming: ['planning', 'cancelled'],
  planning: ['running', 'cancelled', 'failed'],
  running: ['integrating', 'paused', 'cancelled', 'failed', 'validating'],
  paused: ['running', 'cancelled'],
  integrating: ['validating', 'failed', 'cancelled'],
  validating: ['awaiting-approval', 'completed', 'running', 'failed', 'cancelled'],
  'awaiting-approval': ['completed', 'running', 'cancelled'],
  completed: [],
  failed: ['running', 'cancelled'],
  cancelled: [],
}

function repositoryScopeFor(repositoryRoot: string, override?: RepositoryScope): RepositoryScope {
  return override ?? { mode: 'single', repositories: [], organizations: [] }
}

/**
 * Forms and governs `AgentTeam`s. Deliberately does not implement its own authorization or
 * credential system (Section 3 of the mission brief): every member is backed by a real
 * `Principal`/`AgentAccessGrant` minted through the same `AccessGrantService` Bundle #10 shipped,
 * so a team's effective authority is exactly the union of its members' explicitly approved grants
 * — never more, and never inherited from teammates.
 */
export class TeamService {
  public constructor(
    private readonly store: OrchestrationStore,
    private readonly accessRuntime: AccessRuntime,
    private readonly now: () => Date = () => new Date(),
  ) {}

  public createTeam(input: CreateTeamInput): AgentTeam {
    if (input.name.trim().length === 0) throw new TeamValidationError('Team name is required.')
    if (input.objective.trim().length === 0) {
      throw new TeamValidationError('Team objective is required.')
    }
    const nowIso = this.now().toISOString()
    const team: AgentTeam = {
      id: randomUUID(),
      missionId: input.missionId,
      repositoryRoot: input.repositoryRoot,
      name: input.name,
      objective: input.objective,
      status: 'forming',
      createdBy: input.createdBy,
      ...(input.ownerGrantId === undefined ? {} : { ownerGrantId: input.ownerGrantId }),
      ...(input.ownerPrincipalId === undefined ? {} : { ownerPrincipalId: input.ownerPrincipalId }),
      createdAt: nowIso,
      updatedAt: nowIso,
      budget: { ...DEFAULT_TEAM_BUDGET, ...input.budget },
      usage: zeroBudgetUsage(),
      metrics: zeroTeamMetrics(),
      unresolvedRisks: [],
      version: 1,
    }
    this.store.teams.write(team.id, team)
    this.audit('team.created', team.id, team.missionId, input.createdBy)
    return team
  }

  public getTeam(teamId: string): AgentTeam {
    const team = this.store.teams.read(teamId)
    if (team === undefined) throw new TeamNotFoundError(`No such team: ${teamId}`)
    return team
  }

  public listTeams(): readonly AgentTeam[] {
    return this.store.teams.list()
  }

  public transition(teamId: string, next: TeamStatus, actor: string): AgentTeam {
    const team = this.getTeam(teamId)
    const allowed = ALLOWED_TRANSITIONS[team.status]
    if (!allowed.includes(next)) {
      throw new TeamValidationError(`Cannot transition team from "${team.status}" to "${next}".`)
    }
    const nowIso = this.now().toISOString()
    const updated: AgentTeam = {
      ...team,
      status: next,
      updatedAt: nowIso,
      version: team.version + 1,
      ...(next === 'running' && team.startedAt === undefined ? { startedAt: nowIso } : {}),
      ...(next === 'completed' || next === 'cancelled' || next === 'failed'
        ? { completedAt: nowIso }
        : {}),
    }
    this.store.teams.write(teamId, updated)
    const eventType: OrchestrationAuditEventType =
      next === 'cancelled'
        ? 'team.cancelled'
        : next === 'completed'
          ? 'team.completed'
          : next === 'failed'
            ? 'team.failed'
            : next === 'paused'
              ? 'team.paused'
              : team.status === 'paused' && next === 'running'
                ? 'team.resumed'
                : 'team.started'
    this.audit(eventType, teamId, team.missionId, actor)
    return updated
  }

  public recordUnresolvedRisk(teamId: string, risk: string): AgentTeam {
    const team = this.getTeam(teamId)
    const updated: AgentTeam = {
      ...team,
      unresolvedRisks: [...team.unresolvedRisks, risk],
      updatedAt: this.now().toISOString(),
      version: team.version + 1,
    }
    this.store.teams.write(teamId, updated)
    return updated
  }

  /**
   * Adds a team member by minting a real, independently revocable `AgentAccessGrant` — this is
   * the one and only channel through which a member gains any capability. `maxTeamSize` is
   * enforced here (Section 28/47): fail closed rather than silently allow an unbounded swarm.
   */
  public addMember(teamId: string, input: CreateTeamMemberInput): AgentTeamMember {
    const team = this.getTeam(teamId)
    const existingActive = this.store
      .membersByTeam(teamId)
      .filter((member) => member.status !== 'removed')
    if (existingActive.length >= team.budget.maxTeamSize) {
      this.audit('budget.exceeded', teamId, team.missionId, input.issuedBy, {
        reasonCode: 'MAX_TEAM_SIZE',
      })
      throw new TeamBudgetExceededError(
        `Team "${teamId}" already has ${existingActive.length} members (max ${team.budget.maxTeamSize}).`,
      )
    }

    const { grant } = this.accessRuntime.grantService.createGrant({
      principalType: input.principalType,
      displayName: input.displayName,
      issuedBy: input.issuedBy,
      profileId: input.accessProfileId,
      repositoryScope: repositoryScopeFor(team.repositoryRoot),
      additionalSymbolWrightCapabilities: [
        'orchestration.team.read',
        'orchestration.candidate.submit',
        'orchestration.review.submit',
      ],
      reason: `Agent team "${team.name}" (${teamId}) member: ${input.role}`,
      issueTokenNow: false,
    })

    const nowIso = this.now().toISOString()
    const member: AgentTeamMember = {
      id: randomUUID(),
      teamId,
      principalId: grant.principalId,
      grantId: grant.id,
      role: input.role,
      provider: input.provider,
      specialization: [...(input.specialization ?? [])],
      status: 'invited',
      assignedTaskIds: [],
      trustTier: input.trustTier,
      concurrencyLimit: input.concurrencyLimit ?? 1,
      resourceLimits: input.resourceLimits ?? {},
      createdAt: nowIso,
      updatedAt: nowIso,
    }
    this.store.members.write(member.id, member)
    this.audit('member.added', teamId, team.missionId, input.issuedBy, undefined, {
      memberId: member.id,
      role: member.role,
      trustTier: member.trustTier,
    })
    return member
  }

  /** Revokes the member's grant immediately (Section 30/23) and marks them removed from the team. */
  public removeMember(
    teamId: string,
    memberId: string,
    actor: string,
    reason?: string,
  ): AgentTeamMember {
    const team = this.getTeam(teamId)
    const member = this.store.members.read(memberId)
    if (member === undefined || member.teamId !== teamId) {
      throw new TeamValidationError(`No such member "${memberId}" on team "${teamId}".`)
    }
    this.accessRuntime.grantService.revokeGrant(member.grantId, actor, reason)
    const updated: AgentTeamMember = {
      ...member,
      status: 'removed',
      updatedAt: this.now().toISOString(),
      removedAt: this.now().toISOString(),
      ...(reason === undefined ? {} : { removedReason: reason }),
    }
    this.store.members.write(memberId, updated)
    this.audit('member.removed', teamId, team.missionId, actor, undefined, { memberId, reason })
    return updated
  }

  public updateMemberStatus(memberId: string, status: AgentTeamMember['status']): AgentTeamMember {
    const member = this.store.members.read(memberId)
    if (member === undefined) throw new TeamValidationError(`No such member "${memberId}".`)
    const updated: AgentTeamMember = { ...member, status, updatedAt: this.now().toISOString() }
    this.store.members.write(memberId, updated)
    return updated
  }

  public activeMemberCount(teamId: string): number {
    return this.store.membersByTeam(teamId).filter((member) => member.status !== 'removed').length
  }

  public countConcurrentlyWorking(teamId: string): number {
    return this.store
      .membersByTeam(teamId)
      .filter((member) => member.status === 'working' || member.status === 'reviewing').length
  }

  private audit(
    type: OrchestrationAuditEventType,
    teamId: string,
    missionId: string,
    actorPrincipalId: string,
    metadata?: Record<string, unknown>,
    extraMetadata?: Record<string, unknown>,
  ): void {
    const event: OrchestrationAuditEvent = {
      id: randomUUID(),
      type,
      timestamp: this.now().toISOString(),
      missionId,
      teamId,
      actorPrincipalId,
      ...(metadata !== undefined || extraMetadata !== undefined
        ? { metadata: { ...metadata, ...extraMetadata } }
        : {}),
    }
    this.store.appendAudit(event)
  }
}
