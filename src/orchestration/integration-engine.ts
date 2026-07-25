import { randomUUID } from 'node:crypto'

import type { AutonomousValidationRunner } from '../autonomy/autonomous-repair-loop.js'
import { RuntimeAutonomousValidationRunner } from '../autonomy/runtime-validation-runner.js'
import { runGitCommand } from '../runtime/git/git-command-runner.js'
import { createDefaultRuntimePolicy } from '../runtime/policy/runtime-policy.js'
import { buildTaskWriteScopeMap, detectConflicts } from './conflict-detector.js'
import type { OrchestrationStore } from './orchestration-store.js'
import type { OrchestrationAuditEvent } from './orchestration-types.js'
import type { CollaborativeTask } from './collaborative-task-types.js'
import type {
  ChangeCandidate,
  IntegrationPlan,
  IntegrationResult,
  IntegrationStep,
  IntegrationStrategy,
  RollbackResult,
  ValidationResult,
} from './change-candidate-types.js'

export class IntegrationValidationError extends Error {}
export class IntegrationNotReadyError extends Error {}

async function resolveMissingIdentityOverrides(repositoryRoot: string): Promise<string[]> {
  const [email, name] = await Promise.all([
    runGitCommand(['config', 'user.email'], repositoryRoot),
    runGitCommand(['config', 'user.name'], repositoryRoot),
  ])
  const overrides: string[] = []
  if (email.exitCode !== 0 || email.stdout.trim().length === 0) {
    overrides.push('-c', 'user.email=symbolwright-agent-team@users.noreply.github.com')
  }
  if (name.exitCode !== 0 || name.stdout.trim().length === 0) {
    overrides.push('-c', 'user.name=SymbolWright Agent Team')
  }
  return overrides
}

function orderCandidatesByTaskDependencies(
  candidates: readonly ChangeCandidate[],
  tasksById: ReadonlyMap<string, CollaborativeTask>,
): readonly ChangeCandidate[] {
  const depth = new Map<string, number>()
  const depthOf = (taskId: string, seen: ReadonlySet<string> = new Set()): number => {
    if (depth.has(taskId)) return depth.get(taskId) as number
    if (seen.has(taskId)) return 0 // cycle guard — dependency validation happens elsewhere
    const task = tasksById.get(taskId)
    if (task === undefined || task.dependencies.length === 0) {
      depth.set(taskId, 0)
      return 0
    }
    const nextSeen = new Set(seen).add(taskId)
    const value = 1 + Math.max(...task.dependencies.map((depId) => depthOf(depId, nextSeen)))
    depth.set(taskId, value)
    return value
  }
  return [...candidates].sort((a, b) => {
    const diff = depthOf(a.taskId) - depthOf(b.taskId)
    return diff !== 0 ? diff : a.submittedAt.localeCompare(b.submittedAt)
  })
}

/**
 * The single authoritative path by which parallel agent work reaches the canonical repository
 * (Section 22). No other module in `src/orchestration/` writes to `team.repositoryRoot` directly
 * — agents only ever submit immutable candidates from their own isolated worktree; only this
 * engine applies them, in dependency order, behind a conflict check, with a real rollback path.
 */
export class TeamIntegrationService {
  public constructor(
    private readonly store: OrchestrationStore,
    private readonly validationRunner: AutonomousValidationRunner = new RuntimeAutonomousValidationRunner(
      { policy: createDefaultRuntimePolicy() },
    ),
    private readonly now: () => Date = () => new Date(),
  ) {}

  public async prepareIntegration(
    teamId: string,
    candidateIds: readonly string[],
    strategy: IntegrationStrategy = 'ordered-patch',
  ): Promise<IntegrationPlan> {
    const team = this.requireTeam(teamId)
    const candidates = candidateIds.map((id) => this.requireCandidate(id))
    for (const candidate of candidates) {
      if (candidate.teamId !== teamId) {
        throw new IntegrationValidationError(
          `Candidate "${candidate.id}" does not belong to team "${teamId}".`,
        )
      }
      if (candidate.status !== 'approved') {
        throw new IntegrationValidationError(
          `Candidate "${candidate.id}" is not approved (status: ${candidate.status}) — it must pass independent review before integration.`,
        )
      }
    }

    const tasks = this.store.tasksByTeam(teamId)
    const tasksById = new Map(tasks.map((task) => [task.id, task]))
    const ordered = orderCandidatesByTaskDependencies(candidates, tasksById)

    const headResult = await runGitCommand(['rev-parse', 'HEAD'], team.repositoryRoot)
    if (headResult.exitCode !== 0) {
      throw new IntegrationValidationError(
        `Cannot resolve canonical HEAD for "${team.repositoryRoot}": ${headResult.stderr.trim()}`,
      )
    }
    const canonicalBaseSha = headResult.stdout.trim()

    const conflicts = detectConflicts(ordered, {
      canonicalBaseSha,
      taskWriteScopeById: buildTaskWriteScopeMap(tasks),
    })
    const blocking = conflicts.some((c) => c.blocking)

    const steps: IntegrationStep[] = ordered.map((candidate, index) => ({
      candidateId: candidate.id,
      order: index,
      status: 'pending',
    }))

    const plan: IntegrationPlan = {
      id: randomUUID(),
      teamId,
      createdAt: this.now().toISOString(),
      candidateIds: ordered.map((candidate) => candidate.id),
      strategy,
      steps,
      conflicts,
      canonicalBaseSha,
      status: blocking ? 'preparing' : 'ready',
    }
    this.store.integrations.write(plan.id, plan)
    this.audit('integration.prepared', teamId, team.missionId, 'orchestration:integration-engine', {
      planId: plan.id,
      blocking,
    })
    return plan
  }

  public async executeIntegration(planId: string): Promise<IntegrationResult> {
    const plan = this.requirePlan(planId)
    if (plan.status !== 'ready') {
      throw new IntegrationNotReadyError(
        `Integration plan "${planId}" is not ready (status: ${plan.status}). Resolve blocking conflicts and call prepareIntegration again.`,
      )
    }
    const team = this.requireTeam(plan.teamId)

    const headResult = await runGitCommand(['rev-parse', 'HEAD'], team.repositoryRoot)
    if (headResult.exitCode !== 0 || headResult.stdout.trim() !== plan.canonicalBaseSha) {
      const drifted: IntegrationPlan = { ...plan, status: 'failed' }
      this.store.integrations.write(planId, drifted)
      throw new IntegrationNotReadyError(
        `Canonical workspace HEAD drifted since this plan was prepared; re-run prepareIntegration.`,
      )
    }

    const executingPlan: IntegrationPlan = { ...plan, status: 'executing' }
    this.store.integrations.write(planId, executingPlan)

    const identityOverrides = await resolveMissingIdentityOverrides(team.repositoryRoot)
    const steps: IntegrationStep[] = plan.steps.map((step) => ({ ...step }))
    const appliedCandidateIds: string[] = []
    let failureReason: string | undefined

    for (const step of steps) {
      const candidate = this.requireCandidate(step.candidateId)
      const applyResult = await runGitCommand(
        [...identityOverrides, 'apply', '--index', candidate.patchRef ?? ''],
        team.repositoryRoot,
      )
      if (applyResult.exitCode !== 0) {
        step.status = 'failed'
        step.error = applyResult.stderr.trim()
        failureReason = `Failed to apply candidate "${candidate.id}": ${applyResult.stderr.trim()}`
        break
      }
      const commitResult = await runGitCommand(
        [
          ...identityOverrides,
          'commit',
          '-m',
          `Integrate ${candidate.id}: ${candidate.rationale.slice(0, 72)}`,
        ],
        team.repositoryRoot,
      )
      if (commitResult.exitCode !== 0) {
        step.status = 'failed'
        step.error = commitResult.stderr.trim()
        failureReason = `Failed to commit candidate "${candidate.id}": ${commitResult.stderr.trim()}`
        break
      }
      step.status = 'applied'
      step.appliedAt = this.now().toISOString()
      appliedCandidateIds.push(candidate.id)
    }

    const validationResults: ValidationResult[] = []
    if (failureReason === undefined) {
      const tasks = this.store.tasksByTeam(plan.teamId)
      const tasksById = new Map(tasks.map((task) => [task.id, task]))
      const commands = new Set<string>()
      for (const candidateId of plan.candidateIds) {
        const candidate = this.requireCandidate(candidateId)
        const task = tasksById.get(candidate.taskId)
        for (const command of task?.validationCommands ?? []) commands.add(command)
      }
      for (const command of commands) {
        const result = await this.validationRunner.run({
          repositoryRoot: team.repositoryRoot,
          phase: 'integration',
          command,
        })
        validationResults.push({
          command,
          outcome: result.passed ? 'pass' : 'fail',
          summary: `${result.stdout}\n${result.stderr}`.trim().slice(0, 4000),
          exitCode: result.exitCode,
          ranAt: this.now().toISOString(),
        })
        if (!result.passed) {
          failureReason = `Validation command failed: ${command}`
          break
        }
      }
    }

    if (failureReason !== undefined) {
      await runGitCommand(['reset', '--hard', plan.canonicalBaseSha], team.repositoryRoot)
      const failedPlan: IntegrationPlan = { ...plan, steps, status: 'failed' }
      this.store.integrations.write(planId, failedPlan)
      this.audit(
        'integration.rolled_back',
        plan.teamId,
        team.missionId,
        'orchestration:integration-engine',
        {
          planId,
          reason: failureReason,
        },
      )
      return {
        planId,
        status: 'failed',
        integratedCandidateIds: [],
        skippedCandidateIds: plan.candidateIds,
        validationResults,
        checkpointId: plan.canonicalBaseSha,
        finishedAt: this.now().toISOString(),
        error: failureReason,
      }
    }

    for (const candidateId of appliedCandidateIds) {
      const candidate = this.requireCandidate(candidateId)
      this.store.candidates.write(candidateId, { ...candidate, status: 'integrated' })
    }
    const succeededPlan: IntegrationPlan = { ...plan, steps, status: 'succeeded' }
    this.store.integrations.write(planId, succeededPlan)
    this.audit(
      'integration.executed',
      plan.teamId,
      team.missionId,
      'orchestration:integration-engine',
      {
        planId,
        integratedCandidateIds: appliedCandidateIds,
      },
    )
    return {
      planId,
      status: 'succeeded',
      integratedCandidateIds: appliedCandidateIds,
      skippedCandidateIds: [],
      validationResults,
      checkpointId: plan.canonicalBaseSha,
      finishedAt: this.now().toISOString(),
    }
  }

  public async rollbackIntegration(integrationId: string, reason: string): Promise<RollbackResult> {
    const plan = this.requirePlan(integrationId)
    const team = this.requireTeam(plan.teamId)
    const restoredFiles = plan.candidateIds.flatMap((candidateId) => {
      const candidate = this.store.candidates.read(candidateId)
      return candidate?.changedFiles.map((file) => file.path) ?? []
    })
    await runGitCommand(['reset', '--hard', plan.canonicalBaseSha], team.repositoryRoot)
    const rolledBack: IntegrationPlan = { ...plan, status: 'rolled-back' }
    this.store.integrations.write(integrationId, rolledBack)
    this.audit(
      'integration.rolled_back',
      plan.teamId,
      team.missionId,
      'orchestration:integration-engine',
      {
        planId: integrationId,
        reason,
      },
    )
    return {
      integrationId,
      reason,
      restoredAt: this.now().toISOString(),
      restoredFiles: [...new Set(restoredFiles)],
    }
  }

  public getPlan(planId: string): IntegrationPlan {
    return this.requirePlan(planId)
  }

  private requireTeam(teamId: string) {
    const team = this.store.teams.read(teamId)
    if (team === undefined) throw new IntegrationValidationError(`No such team: ${teamId}`)
    return team
  }

  private requireCandidate(candidateId: string): ChangeCandidate {
    const candidate = this.store.candidates.read(candidateId)
    if (candidate === undefined) {
      throw new IntegrationValidationError(`No such change candidate: ${candidateId}`)
    }
    return candidate
  }

  private requirePlan(planId: string): IntegrationPlan {
    const plan = this.store.integrations.read(planId)
    if (plan === undefined)
      throw new IntegrationValidationError(`No such integration plan: ${planId}`)
    return plan
  }

  private audit(
    type: OrchestrationAuditEvent['type'],
    teamId: string,
    missionId: string,
    actorPrincipalId: string,
    metadata: Record<string, unknown>,
  ): void {
    const event: OrchestrationAuditEvent = {
      id: randomUUID(),
      type,
      timestamp: this.now().toISOString(),
      missionId,
      teamId,
      actorPrincipalId,
      metadata,
    }
    this.store.appendAudit(event)
  }
}
