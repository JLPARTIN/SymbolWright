import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { AccessRuntime } from '../access/access-runtime.js'
import { AuthorizationDeniedError } from '../access/authorization-service.js'
import { runGitCommand } from '../runtime/git/git-command-runner.js'
import type { AutonomousValidationRunner } from '../autonomy/autonomous-repair-loop.js'
import { CandidateBudgetExceededError } from './change-candidate-service.js'
import { detectConflicts } from './conflict-detector.js'
import { IntegrationNotReadyError } from './integration-engine.js'
import { OrchestrationRuntime } from './orchestration-runtime.js'
import { SelfReviewNotPermittedError } from './review-service.js'
import { WorkspaceScopeViolationError } from './agent-workspace-service.js'

/**
 * Real, non-mock end-to-end proof of the multi-agent collaboration vertical path (Section 44 of
 * the mission brief): a real git repository, real isolated worktrees, real delegated-access
 * grants, real candidate diffs, real peer review, real conflict detection, and real integration
 * with commit history — no constructed unit-test objects standing in for the runtime.
 */

const fakeValidationRunner: AutonomousValidationRunner = {
  run: async (input) => ({
    phase: input.phase,
    command: input.command,
    passed: !input.command.includes('exit 1'),
    exitCode: input.command.includes('exit 1') ? 1 : 0,
    stdout: 'ok',
    stderr: '',
    durationMs: 1,
  }),
}

describe('agent team collaboration — real end-to-end runtime', () => {
  let root: string
  let accessRuntime: AccessRuntime
  let orchestration: OrchestrationRuntime

  beforeEach(async () => {
    root = mkdtempSync(join(tmpdir(), 'symbolwright-agent-team-e2e-'))
    await runGitCommand(['init'], root)
    await runGitCommand(['config', 'user.email', 'test@example.com'], root)
    await runGitCommand(['config', 'user.name', 'Test'], root)
    writeFileSync(join(root, 'src.txt'), 'line one\n')
    writeFileSync(join(root, 'other.txt'), 'unrelated\n')
    await runGitCommand(['add', '-A'], root)
    await runGitCommand(['commit', '-m', 'initial'], root)

    accessRuntime = new AccessRuntime({ workspaceRoot: root })
    orchestration = new OrchestrationRuntime({ workspaceRoot: root, accessRuntime })
    // Replace the default (Docker-requiring) validation runner with a deterministic fake for this
    // hermetic test — production still defaults to the real hardened `RuntimeAutonomousValidationRunner`.
    ;(
      orchestration.integrationService as unknown as {
        validationRunner: AutonomousValidationRunner
      }
    ).validationRunner = fakeValidationRunner
  })

  afterEach(() => rmSync(root, { recursive: true, force: true }))

  async function requireCapability(memberId: string, capability: string): Promise<void> {
    const member = orchestration.store.members.read(memberId)
    if (member === undefined) throw new Error('member not found')
    await accessRuntime.authorizationService.requireAuthorized({
      principalId: member.principalId,
      grantId: member.grantId,
      capability,
      toolName: 'orchestration',
    })
  }

  it('runs a full competitive-implementation mission to one validated integration', async () => {
    const team = orchestration.teamService.createTeam({
      missionId: 'mission-1',
      repositoryRoot: root,
      name: 'Fix flaky recovery path',
      objective: 'Improve src.txt reliability',
      createdBy: 'operator',
    })
    expect(team.status).toBe('forming')

    const implementerA = orchestration.teamService.addMember(team.id, {
      displayName: 'Implementer A',
      principalType: 'coding-agent',
      role: 'implementation-agent',
      provider: 'symbolwright-native',
      trustTier: 'standard',
      accessProfileId: 'coding-agent',
      issuedBy: 'operator',
    })
    const implementerB = orchestration.teamService.addMember(team.id, {
      displayName: 'Implementer B',
      principalType: 'coding-agent',
      role: 'implementation-agent',
      provider: 'anthropic',
      trustTier: 'standard',
      accessProfileId: 'coding-agent',
      issuedBy: 'operator',
    })
    const reviewer = orchestration.teamService.addMember(team.id, {
      displayName: 'Adversarial Reviewer',
      principalType: 'llm',
      role: 'adversarial-reviewer',
      provider: 'google',
      trustTier: 'trusted',
      accessProfileId: 'repository-analyst',
      issuedBy: 'operator',
    })
    expect(orchestration.teamService.activeMemberCount(team.id)).toBe(3)

    orchestration.teamService.transition(team.id, 'planning', 'operator')
    orchestration.teamService.transition(team.id, 'running', 'operator')

    const task = orchestration.taskService.createTask(
      team.missionId,
      team.id,
      {
        title: 'Implement retry fix',
        objective: 'Add a bounded retry to src.txt handling',
        taskType: 'implementation',
        requiredRole: 'implementation-agent',
        executionMode: 'isolated-mutation',
        assignmentPolicy: 'competitive',
        writePaths: ['src.txt'],
        validationCommands: ['echo "ok"'],
      },
      'operator',
    )
    expect(task.status).toBe('ready')

    const decision = orchestration.assignmentEngine.assign(team.id, task.id)
    expect([...decision.selectedAgentIds].sort()).toEqual([implementerA.id, implementerB.id].sort())
    expect(decision.unresolved).toBeUndefined()
    orchestration.taskService.assignAgents(task.id, decision.selectedAgentIds)

    // --- isolated workspaces: two real git worktrees on the same immutable base SHA ---
    const workspaceA = await orchestration.workspaceService.createWorkspace({
      teamId: team.id,
      taskId: task.id,
      agentId: implementerA.id,
      repositoryRoot: root,
      mode: 'worktree',
      allowedWritePaths: ['src.txt'],
    })
    const workspaceB = await orchestration.workspaceService.createWorkspace({
      teamId: team.id,
      taskId: task.id,
      agentId: implementerB.id,
      repositoryRoot: root,
      mode: 'worktree',
      allowedWritePaths: ['src.txt'],
    })
    expect(workspaceA.rootPath).not.toBe(workspaceB.rootPath)
    expect(workspaceA.baseSha).toBe(workspaceB.baseSha)

    writeFileSync(join(workspaceA.rootPath, 'src.txt'), 'line one\nretry: naive\n')
    writeFileSync(join(workspaceB.rootPath, 'src.txt'), 'line one\nretry: bounded (max 3)\n')

    await requireCapability(implementerA.id, 'orchestration.candidate.submit')
    const candidateA = await orchestration.candidateService.submitCandidate({
      missionId: team.missionId,
      teamId: team.id,
      taskId: task.id,
      agentId: implementerA.id,
      workspace: workspaceA,
      rationale: 'Naive retry without a bound.',
      maxCandidatesForTask: team.budget.maxCandidateImplementationsPerTask,
    })
    await requireCapability(implementerB.id, 'orchestration.candidate.submit')
    const candidateB = await orchestration.candidateService.submitCandidate({
      missionId: team.missionId,
      teamId: team.id,
      taskId: task.id,
      agentId: implementerB.id,
      workspace: workspaceB,
      rationale: 'Bounded retry (max 3 attempts), matches acceptance criteria.',
      maxCandidatesForTask: team.budget.maxCandidateImplementationsPerTask,
    })
    orchestration.taskService.recordCandidate(task.id, candidateA.id)
    orchestration.taskService.recordCandidate(task.id, candidateB.id)

    // --- self-review is refused outright (AC14 / Section 18) ---
    expect(() =>
      orchestration.reviewService.submitReview({
        candidateId: candidateA.id,
        teamId: team.id,
        reviewerId: implementerA.id,
        findings: [],
        verdict: 'approve',
        rationale: 'Looks fine to me.',
      }),
    ).toThrow(SelfReviewNotPermittedError)

    // --- independent adversarial review: reject the weaker candidate, approve the stronger one ---
    await requireCapability(reviewer.id, 'orchestration.review.submit')
    orchestration.reviewService.submitReview({
      candidateId: candidateA.id,
      teamId: team.id,
      reviewerId: reviewer.id,
      findings: [
        {
          severity: 'blocking',
          summary: 'Unbounded retry can loop forever on a persistent failure.',
          filePath: 'src.txt',
        },
      ],
      verdict: 'reject',
      rationale: 'No bound on retry attempts — real production risk.',
    })
    expect(orchestration.reviewService.hasOpenBlockingFindings(candidateA.id)).toBe(true)
    orchestration.candidateService.decide(
      candidateA.id,
      'rejected',
      reviewer.id,
      'Unbounded retry risk.',
    )

    orchestration.reviewService.submitReview({
      candidateId: candidateB.id,
      teamId: team.id,
      reviewerId: reviewer.id,
      findings: [],
      verdict: 'approve',
      rationale: 'Bounded retry matches acceptance criteria; no blocking findings.',
    })
    expect(orchestration.reviewService.hasIndependentApproval(candidateB.id)).toBe(true)
    orchestration.candidateService.decide(
      candidateB.id,
      'approved',
      reviewer.id,
      'Approved for integration.',
    )

    // --- controlled integration: only the accepted candidate reaches the canonical workspace ---
    const plan = await orchestration.integrationService.prepareIntegration(team.id, [candidateB.id])
    expect(plan.status).toBe('ready')
    expect(plan.conflicts).toHaveLength(0)

    const result = await orchestration.integrationService.executeIntegration(plan.id)
    expect(result.status).toBe('succeeded')
    expect(result.integratedCandidateIds).toEqual([candidateB.id])
    expect(result.validationResults[0]?.outcome).toBe('pass')

    const integratedContent = readFileSync(join(root, 'src.txt'), 'utf8')
    expect(integratedContent).toContain('bounded (max 3)')
    expect(integratedContent).not.toContain('naive')

    const integratedCandidate = orchestration.candidateService.getCandidate(candidateB.id)
    expect(integratedCandidate.status).toBe('integrated')

    orchestration.teamService.transition(team.id, 'validating', 'operator')
    const completedTeam = orchestration.teamService.transition(team.id, 'completed', 'operator')
    expect(completedTeam.status).toBe('completed')
    expect(completedTeam.completedAt).toBeDefined()

    // --- revoking a member's grant stops it immediately (AC23), even after the mission moved on ---
    orchestration.teamService.removeMember(team.id, implementerA.id, 'operator', 'mission complete')
    await expect(
      requireCapability(implementerA.id, 'orchestration.candidate.submit'),
    ).rejects.toThrow(AuthorizationDeniedError)

    // --- audit trail reconstructs the mission (AC30) ---
    const auditTypes = orchestration.store.listAudit().map((event) => event.type)
    expect(auditTypes).toEqual(
      expect.arrayContaining([
        'team.created',
        'member.added',
        'task.created',
        'task.assigned',
        'candidate.submitted',
        'review.self_review_rejected',
        'review.submitted',
        'candidate.rejected',
        'candidate.accepted',
        'integration.prepared',
        'integration.executed',
        'member.removed',
      ]),
    )
  })

  it('rejects a workspace write outside the task’s declared scope', async () => {
    const team = orchestration.teamService.createTeam({
      missionId: 'mission-2',
      repositoryRoot: root,
      name: 'Scope test',
      objective: 'Verify workspace scoping',
      createdBy: 'operator',
    })
    const member = orchestration.teamService.addMember(team.id, {
      displayName: 'Implementer',
      principalType: 'coding-agent',
      role: 'implementation-agent',
      provider: 'symbolwright-native',
      trustTier: 'standard',
      accessProfileId: 'coding-agent',
      issuedBy: 'operator',
    })
    const task = orchestration.taskService.createTask(
      team.missionId,
      team.id,
      {
        title: 'Scoped task',
        objective: 'Only touch src.txt',
        taskType: 'implementation',
        executionMode: 'isolated-mutation',
        assignmentPolicy: 'single-agent',
        writePaths: ['src.txt'],
      },
      'operator',
    )
    const workspace = await orchestration.workspaceService.createWorkspace({
      teamId: team.id,
      taskId: task.id,
      agentId: member.id,
      repositoryRoot: root,
      mode: 'worktree',
      allowedWritePaths: ['src.txt'],
    })
    expect(() =>
      orchestration.workspaceService.assertWritePathAllowed(workspace, 'other.txt'),
    ).toThrow(WorkspaceScopeViolationError)
    expect(orchestration.workspaceService.assertWritePathAllowed(workspace, 'src.txt')).toContain(
      'src.txt',
    )
  })

  it('detects a textual-overlap conflict between two competitive candidates touching the same file', async () => {
    const team = orchestration.teamService.createTeam({
      missionId: 'mission-3',
      repositoryRoot: root,
      name: 'Conflict test',
      objective: 'Verify conflict detection',
      createdBy: 'operator',
    })
    const memberA = orchestration.teamService.addMember(team.id, {
      displayName: 'A',
      principalType: 'coding-agent',
      role: 'implementation-agent',
      provider: 'symbolwright-native',
      trustTier: 'standard',
      accessProfileId: 'coding-agent',
      issuedBy: 'operator',
    })
    const memberB = orchestration.teamService.addMember(team.id, {
      displayName: 'B',
      principalType: 'coding-agent',
      role: 'implementation-agent',
      provider: 'symbolwright-native',
      trustTier: 'standard',
      accessProfileId: 'coding-agent',
      issuedBy: 'operator',
    })
    const task = orchestration.taskService.createTask(
      team.missionId,
      team.id,
      {
        title: 'Competing edits',
        objective: 'Both touch src.txt',
        taskType: 'implementation',
        executionMode: 'isolated-mutation',
        assignmentPolicy: 'competitive',
        writePaths: ['src.txt'],
      },
      'operator',
    )
    const workspaceA = await orchestration.workspaceService.createWorkspace({
      teamId: team.id,
      taskId: task.id,
      agentId: memberA.id,
      repositoryRoot: root,
      mode: 'worktree',
      allowedWritePaths: ['src.txt'],
    })
    const workspaceB = await orchestration.workspaceService.createWorkspace({
      teamId: team.id,
      taskId: task.id,
      agentId: memberB.id,
      repositoryRoot: root,
      mode: 'worktree',
      allowedWritePaths: ['src.txt'],
    })
    writeFileSync(join(workspaceA.rootPath, 'src.txt'), 'line one\nA change\n')
    writeFileSync(join(workspaceB.rootPath, 'src.txt'), 'line one\nB change\n')
    const candidateA = await orchestration.candidateService.submitCandidate({
      missionId: team.missionId,
      teamId: team.id,
      taskId: task.id,
      agentId: memberA.id,
      workspace: workspaceA,
      rationale: 'A',
      maxCandidatesForTask: 5,
    })
    const candidateB = await orchestration.candidateService.submitCandidate({
      missionId: team.missionId,
      teamId: team.id,
      taskId: task.id,
      agentId: memberB.id,
      workspace: workspaceB,
      rationale: 'B',
      maxCandidatesForTask: 5,
    })
    orchestration.candidateService.decide(candidateA.id, 'approved', 'operator', 'ok')
    orchestration.candidateService.decide(candidateB.id, 'approved', 'operator', 'ok')

    const conflicts = detectConflicts([candidateA, candidateB], {
      canonicalBaseSha: workspaceA.baseSha,
    })
    expect(conflicts.some((c) => c.category === 'textual-overlap' && c.blocking)).toBe(true)

    const plan = await orchestration.integrationService.prepareIntegration(team.id, [
      candidateA.id,
      candidateB.id,
    ])
    expect(plan.status).toBe('preparing')
    await expect(orchestration.integrationService.executeIntegration(plan.id)).rejects.toThrow(
      IntegrationNotReadyError,
    )
  })

  it('rolls back an integration whose validation step fails, and enforces the per-task candidate budget', async () => {
    const team = orchestration.teamService.createTeam({
      missionId: 'mission-4',
      repositoryRoot: root,
      name: 'Repair budget test',
      objective: 'Verify rollback and budgets',
      createdBy: 'operator',
      budget: { maxCandidateImplementationsPerTask: 1 },
    })
    const member = orchestration.teamService.addMember(team.id, {
      displayName: 'Implementer',
      principalType: 'coding-agent',
      role: 'implementation-agent',
      provider: 'symbolwright-native',
      trustTier: 'standard',
      accessProfileId: 'coding-agent',
      issuedBy: 'operator',
    })
    const task = orchestration.taskService.createTask(
      team.missionId,
      team.id,
      {
        title: 'Failing validation task',
        objective: 'Introduce a change whose validation fails',
        taskType: 'implementation',
        executionMode: 'isolated-mutation',
        assignmentPolicy: 'single-agent',
        writePaths: ['src.txt'],
        validationCommands: ['exit 1'],
      },
      'operator',
    )
    const workspace = await orchestration.workspaceService.createWorkspace({
      teamId: team.id,
      taskId: task.id,
      agentId: member.id,
      repositoryRoot: root,
      mode: 'worktree',
      allowedWritePaths: ['src.txt'],
    })
    writeFileSync(join(workspace.rootPath, 'src.txt'), 'line one\nbroken change\n')
    const candidate = await orchestration.candidateService.submitCandidate({
      missionId: team.missionId,
      teamId: team.id,
      taskId: task.id,
      agentId: member.id,
      workspace,
      rationale: 'Will fail validation.',
      maxCandidatesForTask: team.budget.maxCandidateImplementationsPerTask,
    })

    // second candidate on the same task exceeds the team's budget override of 1
    const workspace2 = await orchestration.workspaceService.createWorkspace({
      teamId: team.id,
      taskId: task.id,
      agentId: member.id,
      repositoryRoot: root,
      mode: 'worktree',
      allowedWritePaths: ['src.txt'],
    })
    writeFileSync(join(workspace2.rootPath, 'src.txt'), 'line one\nsecond attempt\n')
    await expect(
      orchestration.candidateService.submitCandidate({
        missionId: team.missionId,
        teamId: team.id,
        taskId: task.id,
        agentId: member.id,
        workspace: workspace2,
        rationale: 'Second attempt.',
        maxCandidatesForTask: team.budget.maxCandidateImplementationsPerTask,
      }),
    ).rejects.toThrow(CandidateBudgetExceededError)

    orchestration.candidateService.decide(candidate.id, 'approved', 'operator', 'approved for test')
    const plan = await orchestration.integrationService.prepareIntegration(team.id, [candidate.id])
    expect(plan.status).toBe('ready')
    const result = await orchestration.integrationService.executeIntegration(plan.id)
    expect(result.status).toBe('failed')

    const restoredContent = readFileSync(join(root, 'src.txt'), 'utf8')
    expect(restoredContent).toBe('line one\n')
    expect(orchestration.candidateService.getCandidate(candidate.id).status).toBe('approved')
  })
})
