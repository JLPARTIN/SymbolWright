import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { AccessRuntime } from '../access/access-runtime.js'
import { runGitCommand } from '../runtime/git/git-command-runner.js'
import {
  CustomRoleValidationError,
  defineCustomAgentRole,
  resolveRoleDefinition,
} from './agent-roles.js'
import {
  CollaborationMessageService,
  MessageValidationError,
} from './collaboration-message-service.js'
import { OrchestrationRuntime } from './orchestration-runtime.js'
import { TeamBudgetExceededError, TeamNotFoundError, TeamValidationError } from './team-service.js'
import { TaskValidationError } from './collaborative-task-service.js'
import { SharedContextValidationError } from './shared-context-service.js'
import { ReviewValidationError, SelfReviewNotPermittedError } from './review-service.js'
import { CandidateValidationError } from './change-candidate-service.js'
import { IntegrationValidationError } from './integration-engine.js'
import {
  WorkspaceScopeViolationError,
  WorkspaceValidationError,
} from './agent-workspace-service.js'

describe('agent-roles', () => {
  it('resolves built-in roles by id', () => {
    const def = resolveRoleDefinition('security-reviewer')
    expect(def?.reviewAuthority).toBe(true)
    expect(def?.defaultMutationAllowed).toBe(false)
  })

  it('defines a valid custom role and rejects a malformed name', () => {
    const custom = defineCustomAgentRole({
      name: 'docs-writer',
      purpose: 'Write and update documentation.',
      responsibilities: ['Write docs'],
      defaultExecutionModes: ['proposal'],
      defaultMutationAllowed: true,
      reviewAuthority: false,
    })
    expect(custom.id).toBe('custom:docs-writer')
    expect(resolveRoleDefinition('custom:docs-writer', [custom])).toBe(custom)

    expect(() =>
      defineCustomAgentRole({
        name: 'Not Kebab Case!',
        purpose: 'x',
        responsibilities: [],
        defaultExecutionModes: [],
        defaultMutationAllowed: false,
        reviewAuthority: false,
      }),
    ).toThrow(CustomRoleValidationError)
  })
})

describe('orchestration services against a real repository', () => {
  let root: string
  let accessRuntime: AccessRuntime
  let orchestration: OrchestrationRuntime

  beforeEach(async () => {
    root = mkdtempSync(join(tmpdir(), 'symbolwright-orchestration-unit-'))
    await runGitCommand(['init'], root)
    await runGitCommand(['config', 'user.email', 'test@example.com'], root)
    await runGitCommand(['config', 'user.name', 'Test'], root)
    writeFileSync(join(root, 'a.txt'), 'a\n')
    await runGitCommand(['add', '-A'], root)
    await runGitCommand(['commit', '-m', 'initial'], root)
    accessRuntime = new AccessRuntime({ workspaceRoot: root })
    orchestration = new OrchestrationRuntime({ workspaceRoot: root, accessRuntime })
  })

  afterEach(() => rmSync(root, { recursive: true, force: true }))

  it('rejects an empty team name/objective', () => {
    expect(() =>
      orchestration.teamService.createTeam({
        missionId: 'm',
        repositoryRoot: root,
        name: '',
        objective: 'x',
        createdBy: 'operator',
      }),
    ).toThrow(TeamValidationError)
  })

  it('enforces maxTeamSize and refuses an invalid status transition', () => {
    const team = orchestration.teamService.createTeam({
      missionId: 'm',
      repositoryRoot: root,
      name: 'Small team',
      objective: 'x',
      createdBy: 'operator',
      budget: { maxTeamSize: 1 },
    })
    orchestration.teamService.addMember(team.id, {
      displayName: 'A',
      principalType: 'coding-agent',
      role: 'implementation-agent',
      provider: 'symbolwright-native',
      trustTier: 'standard',
      accessProfileId: 'coding-agent',
      issuedBy: 'operator',
    })
    expect(() =>
      orchestration.teamService.addMember(team.id, {
        displayName: 'B',
        principalType: 'coding-agent',
        role: 'implementation-agent',
        provider: 'symbolwright-native',
        trustTier: 'standard',
        accessProfileId: 'coding-agent',
        issuedBy: 'operator',
      }),
    ).toThrow(TeamBudgetExceededError)

    expect(() => orchestration.teamService.transition(team.id, 'completed', 'operator')).toThrow(
      TeamValidationError,
    )
  })

  it('refuses to create a task with an unknown dependency', () => {
    const team = orchestration.teamService.createTeam({
      missionId: 'm',
      repositoryRoot: root,
      name: 'T',
      objective: 'x',
      createdBy: 'operator',
    })
    expect(() =>
      orchestration.taskService.createTask(
        team.missionId,
        team.id,
        {
          title: 'x',
          objective: 'x',
          taskType: 'implementation',
          dependencies: ['does-not-exist'],
          executionMode: 'analysis',
          assignmentPolicy: 'single-agent',
        },
        'operator',
      ),
    ).toThrow(TaskValidationError)
  })

  it('marks a dependent task ready only once its dependency is integrated', () => {
    const team = orchestration.teamService.createTeam({
      missionId: 'm',
      repositoryRoot: root,
      name: 'T',
      objective: 'x',
      createdBy: 'operator',
    })
    const upstream = orchestration.taskService.createTask(
      team.missionId,
      team.id,
      {
        title: 'Investigate',
        objective: 'x',
        taskType: 'investigation',
        executionMode: 'analysis',
        assignmentPolicy: 'single-agent',
      },
      'operator',
    )
    const downstream = orchestration.taskService.createTask(
      team.missionId,
      team.id,
      {
        title: 'Implement',
        objective: 'x',
        taskType: 'implementation',
        dependencies: [upstream.id],
        executionMode: 'isolated-mutation',
        assignmentPolicy: 'single-agent',
      },
      'operator',
    )
    expect(downstream.status).toBe('queued')
    orchestration.taskService.setStatus(upstream.id, 'integrated')
    const [refreshed] = orchestration.taskService.refreshReadiness(team.id)
    expect(refreshed?.id).toBe(downstream.id)
    expect(refreshed?.status).toBe('ready')
  })

  it('assignment engine records an unresolved decision when no member is eligible', () => {
    const team = orchestration.teamService.createTeam({
      missionId: 'm',
      repositoryRoot: root,
      name: 'T',
      objective: 'x',
      createdBy: 'operator',
    })
    const task = orchestration.taskService.createTask(
      team.missionId,
      team.id,
      {
        title: 'Needs a security reviewer',
        objective: 'x',
        requiredRole: 'security-reviewer',
        taskType: 'security-review',
        executionMode: 'review',
        assignmentPolicy: 'single-agent',
      },
      'operator',
    )
    const decision = orchestration.assignmentEngine.assign(team.id, task.id)
    expect(decision.unresolved).toBe(true)
    expect(decision.selectedAgentIds).toHaveLength(0)
  })

  it('shared context: only operator/validation/policy sources may be authoritative on entry', () => {
    const team = orchestration.teamService.createTeam({
      missionId: 'm',
      repositoryRoot: root,
      name: 'T',
      objective: 'x',
      createdBy: 'operator',
    })
    expect(() =>
      orchestration.contextService.addEntry({
        missionId: team.missionId,
        teamId: team.id,
        category: 'authoritative-context',
        content: { claim: 'trust me' },
        sourceType: 'agent',
        sourceId: 'some-agent',
        createdBy: 'some-agent',
        initialTrustStatus: 'authoritative',
      }),
    ).toThrow(SharedContextValidationError)

    const entry = orchestration.contextService.addEntry({
      missionId: team.missionId,
      teamId: team.id,
      category: 'agent-proposals',
      content: { claim: 'the bug is in module X' },
      sourceType: 'agent',
      sourceId: 'some-agent',
      createdBy: 'some-agent',
    })
    expect(entry.trustStatus).toBe('unverified')
    expect(orchestration.contextService.authoritativeContextForTeam(team.id)).toHaveLength(0)

    const promoted = orchestration.contextService.promote(
      entry.id,
      'operator',
      'Confirmed by re-reading the source.',
    )
    expect(promoted.trustStatus).toBe('accepted')
    expect(orchestration.contextService.authoritativeContextForTeam(team.id)).toHaveLength(1)
  })

  it('collaboration messages require a known, team-matching sender', () => {
    const team = orchestration.teamService.createTeam({
      missionId: 'm',
      repositoryRoot: root,
      name: 'T',
      objective: 'x',
      createdBy: 'operator',
    })
    const messages = new CollaborationMessageService(orchestration.store)
    expect(() =>
      messages.send({
        missionId: team.missionId,
        teamId: team.id,
        type: 'agent.status',
        senderId: 'unknown-member',
        body: { status: 'working' },
      }),
    ).toThrow(MessageValidationError)

    const operatorMessage = messages.send({
      missionId: team.missionId,
      teamId: team.id,
      type: 'operator.input.requested',
      senderId: 'operator',
      body: { question: 'Which branch should we target?' },
    })
    expect(operatorMessage.senderId).toBe('operator')
    expect(messages.listForTeam(team.id)).toHaveLength(1)
  })

  it('team service: getTeam/removeMember/addMember reject unknown ids', () => {
    expect(() => orchestration.teamService.getTeam('does-not-exist')).toThrow(TeamNotFoundError)
    const team = orchestration.teamService.createTeam({
      missionId: 'm',
      repositoryRoot: root,
      name: 'T',
      objective: 'x',
      createdBy: 'operator',
    })
    expect(() =>
      orchestration.teamService.removeMember(team.id, 'does-not-exist', 'operator'),
    ).toThrow(TeamValidationError)
    expect(() =>
      orchestration.teamService.addMember(team.id, {
        displayName: 'Bad profile',
        principalType: 'coding-agent',
        role: 'implementation-agent',
        provider: 'symbolwright-native',
        trustTier: 'standard',
        accessProfileId: 'not-a-real-profile',
        issuedBy: 'operator',
      }),
    ).toThrow() // GrantValidationError from the underlying AccessGrantService
  })

  it('review service: rejects reviewing an unknown candidate and validates finding-dismissal evidence', async () => {
    expect(() =>
      orchestration.reviewService.submitReview({
        candidateId: 'does-not-exist',
        teamId: 't',
        reviewerId: 'someone',
        findings: [],
        verdict: 'approve',
        rationale: 'x',
      }),
    ).toThrow(ReviewValidationError)

    const team = orchestration.teamService.createTeam({
      missionId: 'm',
      repositoryRoot: root,
      name: 'T',
      objective: 'x',
      createdBy: 'operator',
    })
    const author = orchestration.teamService.addMember(team.id, {
      displayName: 'A',
      principalType: 'coding-agent',
      role: 'implementation-agent',
      provider: 'symbolwright-native',
      trustTier: 'standard',
      accessProfileId: 'coding-agent',
      issuedBy: 'operator',
    })
    const reviewer = orchestration.teamService.addMember(team.id, {
      displayName: 'R',
      principalType: 'llm',
      role: 'adversarial-reviewer',
      provider: 'symbolwright-native',
      trustTier: 'trusted',
      accessProfileId: 'repository-analyst',
      issuedBy: 'operator',
    })
    const task = orchestration.taskService.createTask(
      team.missionId,
      team.id,
      {
        title: 'x',
        objective: 'x',
        taskType: 'implementation',
        executionMode: 'isolated-mutation',
        assignmentPolicy: 'single-agent',
        writePaths: ['a.txt'],
      },
      'operator',
    )
    const workspace = await orchestration.workspaceService.createWorkspace({
      teamId: team.id,
      taskId: task.id,
      agentId: author.id,
      repositoryRoot: root,
      mode: 'worktree',
      allowedWritePaths: ['a.txt'],
    })
    writeFileSync(join(workspace.rootPath, 'a.txt'), 'a\nchanged\n')
    const candidate = await orchestration.candidateService.submitCandidate({
      missionId: team.missionId,
      teamId: team.id,
      taskId: task.id,
      agentId: author.id,
      workspace,
      rationale: 'x',
      maxCandidatesForTask: 5,
    })

    expect(orchestration.reviewService.hasIndependentApproval(candidate.id)).toBe(false)

    const review = orchestration.reviewService.submitReview({
      candidateId: candidate.id,
      teamId: team.id,
      reviewerId: reviewer.id,
      findings: [{ severity: 'blocking', summary: 'needs a fix' }],
      verdict: 'request-changes',
      rationale: 'x',
    })
    expect(orchestration.reviewService.hasOpenBlockingFindings(candidate.id)).toBe(true)
    expect(orchestration.reviewService.hasIndependentApproval(candidate.id)).toBe(false)

    const finding = review.findings[0]
    if (finding === undefined) throw new Error('expected a finding')
    expect(() =>
      orchestration.reviewService.dismissFinding(review.id, finding.id, 'operator', ''),
    ).toThrow(ReviewValidationError)
    orchestration.reviewService.dismissFinding(
      review.id,
      finding.id,
      'operator',
      'Fixed in follow-up.',
    )
    expect(orchestration.reviewService.hasOpenBlockingFindings(candidate.id)).toBe(false)

    // self-review is refused even without a candidateId lookup fallback
    expect(() =>
      orchestration.reviewService.submitReview({
        candidateId: candidate.id,
        teamId: team.id,
        reviewerId: author.id,
        findings: [],
        verdict: 'approve',
        rationale: 'x',
      }),
    ).toThrow(SelfReviewNotPermittedError)
  })

  it('integration engine: rejects unapproved or unowned candidates, and unknown plans/candidates', async () => {
    const team = orchestration.teamService.createTeam({
      missionId: 'm',
      repositoryRoot: root,
      name: 'T',
      objective: 'x',
      createdBy: 'operator',
    })
    const otherTeam = orchestration.teamService.createTeam({
      missionId: 'm2',
      repositoryRoot: root,
      name: 'Other',
      objective: 'x',
      createdBy: 'operator',
    })
    await expect(
      orchestration.integrationService.prepareIntegration('does-not-exist', []),
    ).rejects.toThrow(IntegrationValidationError)
    await expect(
      orchestration.integrationService.executeIntegration('does-not-exist'),
    ).rejects.toThrow(IntegrationValidationError)
    await expect(
      orchestration.integrationService.prepareIntegration(team.id, ['does-not-exist']),
    ).rejects.toThrow(IntegrationValidationError)

    const member = orchestration.teamService.addMember(team.id, {
      displayName: 'A',
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
        title: 'x',
        objective: 'x',
        taskType: 'implementation',
        executionMode: 'isolated-mutation',
        assignmentPolicy: 'single-agent',
        writePaths: ['a.txt'],
      },
      'operator',
    )
    const workspace = await orchestration.workspaceService.createWorkspace({
      teamId: team.id,
      taskId: task.id,
      agentId: member.id,
      repositoryRoot: root,
      mode: 'worktree',
      allowedWritePaths: ['a.txt'],
    })
    writeFileSync(join(workspace.rootPath, 'a.txt'), 'a\nchanged\n')
    const candidate = await orchestration.candidateService.submitCandidate({
      missionId: team.missionId,
      teamId: team.id,
      taskId: task.id,
      agentId: member.id,
      workspace,
      rationale: 'x',
      maxCandidatesForTask: 5,
    })

    // not yet approved
    await expect(
      orchestration.integrationService.prepareIntegration(team.id, [candidate.id]),
    ).rejects.toThrow(IntegrationValidationError)

    // belongs to a different team
    await expect(
      orchestration.integrationService.prepareIntegration(otherTeam.id, [candidate.id]),
    ).rejects.toThrow(IntegrationValidationError)
  })

  it('candidate service rejects a read-only workspace and an unknown candidate lookup', async () => {
    const team = orchestration.teamService.createTeam({
      missionId: 'm',
      repositoryRoot: root,
      name: 'T',
      objective: 'x',
      createdBy: 'operator',
    })
    const member = orchestration.teamService.addMember(team.id, {
      displayName: 'A',
      principalType: 'coding-agent',
      role: 'repository-investigator',
      provider: 'symbolwright-native',
      trustTier: 'standard',
      accessProfileId: 'repository-analyst',
      issuedBy: 'operator',
    })
    const task = orchestration.taskService.createTask(
      team.missionId,
      team.id,
      {
        title: 'x',
        objective: 'x',
        taskType: 'investigation',
        executionMode: 'analysis',
        assignmentPolicy: 'single-agent',
      },
      'operator',
    )
    const readOnlyWorkspace = await orchestration.workspaceService.createWorkspace({
      teamId: team.id,
      taskId: task.id,
      agentId: member.id,
      repositoryRoot: root,
      mode: 'read-only',
    })
    await expect(
      orchestration.candidateService.submitCandidate({
        missionId: team.missionId,
        teamId: team.id,
        taskId: task.id,
        agentId: member.id,
        workspace: readOnlyWorkspace,
        rationale: 'x',
        maxCandidatesForTask: 5,
      }),
    ).rejects.toThrow(CandidateValidationError)
    expect(() => orchestration.candidateService.getCandidate('does-not-exist')).toThrow(
      CandidateValidationError,
    )
    expect(() =>
      orchestration.workspaceService.assertWritePathAllowed(readOnlyWorkspace, 'a.txt'),
    ).toThrow(WorkspaceScopeViolationError)
    expect(() => orchestration.workspaceService.getWorkspace('does-not-exist')).toThrow(
      WorkspaceValidationError,
    )
  })
})
