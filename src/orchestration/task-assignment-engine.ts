import { randomUUID } from 'node:crypto'

import type { OrchestrationStore } from './orchestration-store.js'
import {
  TRUST_TIER_RANK,
  type AgentTeamMember,
  type OrchestrationAuditEvent,
} from './orchestration-types.js'
import type {
  AgentAssignmentDecision,
  AssignmentReason,
  CollaborativeTask,
} from './collaborative-task-types.js'
import { resolveRoleDefinition, type AgentRoleDefinition } from './agent-roles.js'

export class AssignmentValidationError extends Error {}

/**
 * Scores eligible team members for a task and persists an auditable decision (Section 11).
 * Never silently substitutes an agent when no eligible candidate exists — an `unresolved`
 * decision is recorded instead, matching the mission brief's "fail closed" requirement.
 */
export class TaskAssignmentEngine {
  public constructor(
    private readonly store: OrchestrationStore,
    private readonly now: () => Date = () => new Date(),
    private readonly customRoles: readonly AgentRoleDefinition[] = [],
  ) {}

  public assign(teamId: string, taskId: string): AgentAssignmentDecision {
    const task = this.store.tasks.read(taskId)
    if (task === undefined) throw new AssignmentValidationError(`No such task: ${taskId}`)
    if (task.teamId !== teamId) {
      throw new AssignmentValidationError(`Task "${taskId}" does not belong to team "${teamId}".`)
    }

    const members = this.store
      .membersByTeam(teamId)
      .filter((member) => member.status !== 'removed' && member.status !== 'failed')
    const concurrentlyWorking = new Set(
      members.filter((member) => member.status === 'working').map((member) => member.id),
    )

    const reasons: AssignmentReason[] = []
    for (const member of members) {
      const eligibility = this.evaluateEligibility(member, task)
      if (!eligibility.eligible) {
        reasons.push({
          memberId: member.id,
          score: 0,
          factors: {},
          selected: false,
          rejectionReason: eligibility.reason ?? 'Not eligible.',
        })
        continue
      }
      const { score, factors } = this.score(member, task, concurrentlyWorking.has(member.id))
      reasons.push({ memberId: member.id, score, factors, selected: false })
    }

    const eligible = reasons.filter((reason) => reason.rejectionReason === undefined)
    eligible.sort((a, b) => b.score - a.score)

    const wantsCompetitive = task.assignmentPolicy === 'competitive'
    const selectedCount = wantsCompetitive
      ? Math.min(2, eligible.length)
      : Math.min(1, eligible.length)
    const selectedIds = eligible.slice(0, selectedCount).map((reason) => reason.memberId)
    const finalReasons = reasons.map((reason) =>
      selectedIds.includes(reason.memberId) ? { ...reason, selected: true } : reason,
    )

    const decision: AgentAssignmentDecision = {
      id: randomUUID(),
      teamId,
      taskId,
      selectedAgentIds: selectedIds,
      strategy: wantsCompetitive ? 'competitive' : 'best-fit',
      reasons: finalReasons,
      decidedAt: this.now().toISOString(),
      ...(selectedIds.length === 0
        ? {
            unresolved: true,
            unresolvedReason:
              'No team member meets this task’s role, capability, or scope requirements.',
          }
        : {}),
    }
    this.store.assignmentDecisions.write(decision.id, decision)
    this.audit(teamId, task.missionId, taskId, decision)
    return decision
  }

  private evaluateEligibility(
    member: AgentTeamMember,
    task: CollaborativeTask,
  ): { eligible: boolean; reason?: string } {
    if (member.status === 'blocked') return { eligible: false, reason: 'Member is blocked.' }
    if (task.requiredRole !== undefined && member.role !== task.requiredRole) {
      return { eligible: false, reason: `Requires role "${task.requiredRole}".` }
    }
    if (task.requiredSpecializations.length > 0) {
      const hasAny = task.requiredSpecializations.some((spec) =>
        member.specialization.includes(spec),
      )
      if (!hasAny) return { eligible: false, reason: 'No matching specialization.' }
    }
    if (member.assignedTaskIds.length >= member.concurrencyLimit) {
      return { eligible: false, reason: 'Member is at its concurrency limit.' }
    }
    const roleDef = resolveRoleDefinition(member.role, this.customRoles)
    if (roleDef !== undefined && !roleDef.defaultExecutionModes.includes(task.executionMode)) {
      return {
        eligible: false,
        reason: `Role "${member.role}" does not perform "${task.executionMode}" tasks.`,
      }
    }
    if (task.executionMode === 'isolated-mutation' && roleDef?.defaultMutationAllowed === false) {
      return { eligible: false, reason: `Role "${member.role}" is read-only by default.` }
    }
    return { eligible: true }
  }

  private score(
    member: AgentTeamMember,
    task: CollaborativeTask,
    currentlyWorking: boolean,
  ): { score: number; factors: Record<string, number> } {
    const roleMatch =
      task.requiredRole === undefined ? 0.5 : task.requiredRole === member.role ? 1 : 0
    const specializationOverlap =
      task.requiredSpecializations.length === 0
        ? 0.5
        : task.requiredSpecializations.filter((spec) => member.specialization.includes(spec))
            .length / task.requiredSpecializations.length
    const trust = TRUST_TIER_RANK[member.trustTier] / 4
    const availability = currentlyWorking ? 0 : 1
    const workloadHeadroom =
      1 - member.assignedTaskIds.length / Math.max(1, member.concurrencyLimit)

    const factors = {
      roleMatch,
      specializationOverlap,
      trust,
      availability,
      workloadHeadroom,
    }
    const score =
      roleMatch * 0.35 +
      specializationOverlap * 0.25 +
      trust * 0.15 +
      availability * 0.15 +
      workloadHeadroom * 0.1
    return { score, factors }
  }

  private audit(
    teamId: string,
    missionId: string,
    taskId: string,
    decision: AgentAssignmentDecision,
  ): void {
    const event: OrchestrationAuditEvent = {
      id: randomUUID(),
      type: decision.unresolved === true ? 'task.assignment.unresolved' : 'task.assigned',
      timestamp: this.now().toISOString(),
      missionId,
      teamId,
      taskId,
      actorPrincipalId: 'orchestration:assignment-engine',
      metadata: { selectedAgentIds: decision.selectedAgentIds, strategy: decision.strategy },
    }
    this.store.appendAudit(event)
  }
}
