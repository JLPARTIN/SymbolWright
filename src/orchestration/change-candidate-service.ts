import { randomUUID } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import { runGitCommand } from '../runtime/git/git-command-runner.js'
import type { OrchestrationStore } from './orchestration-store.js'
import type { OrchestrationAuditEvent } from './orchestration-types.js'
import type { AgentWorkspace } from './agent-workspace-types.js'
import type {
  ChangeCandidate,
  ChangedFileSummary,
  EvidenceRef,
  RiskSummary,
  ValidationResult,
} from './change-candidate-types.js'

export class CandidateValidationError extends Error {}
export class CandidateBudgetExceededError extends Error {}

export interface SubmitCandidateInput {
  readonly missionId: string
  readonly teamId: string
  readonly taskId: string
  readonly agentId: string
  readonly workspace: AgentWorkspace
  readonly rationale: string
  readonly acceptanceEvidence?: readonly EvidenceRef[]
  readonly validationResults?: readonly ValidationResult[]
  readonly riskSummary?: RiskSummary
  /** Set only when this candidate corrects a prior, immutable candidate — never mutates it. */
  readonly correctsCandidateId?: string
  readonly maxCandidatesForTask: number
}

function parseNumstat(numstat: string): ChangedFileSummary[] {
  return numstat
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => {
      const [addedRaw, removedRaw, ...pathParts] = line.split('\t')
      const filePath = pathParts.join('\t')
      const linesAdded = addedRaw === '-' ? 0 : Number(addedRaw)
      const linesRemoved = removedRaw === '-' ? 0 : Number(removedRaw)
      return {
        path: filePath,
        changeType: 'modified' as const,
        linesAdded: Number.isFinite(linesAdded) ? linesAdded : 0,
        linesRemoved: Number.isFinite(linesRemoved) ? linesRemoved : 0,
      }
    })
}

/**
 * Turns an isolated agent workspace's uncommitted work into an immutable `ChangeCandidate`
 * (Section 20). Immutable means immutable: no method here ever rewrites `changedFiles`,
 * `patchRef`, or `baseSha` on an existing candidate — a correction always creates a new record
 * with `correctsCandidateId` set and marks the prior one `superseded`, so the integration engine
 * and audit trail always reference an exact, never-rewritten submission.
 */
export class ChangeCandidateService {
  public constructor(
    private readonly store: OrchestrationStore,
    private readonly patchStoreRoot: string,
    private readonly now: () => Date = () => new Date(),
  ) {}

  public async submitCandidate(input: SubmitCandidateInput): Promise<ChangeCandidate> {
    if (input.workspace.mode !== 'worktree') {
      throw new CandidateValidationError(
        `Cannot submit a mutation candidate from a "${input.workspace.mode}" workspace.`,
      )
    }
    if (input.workspace.status !== 'ready' && input.workspace.status !== 'leased') {
      throw new CandidateValidationError(
        `Workspace "${input.workspace.id}" is not available for submission (status: ${input.workspace.status}).`,
      )
    }

    const existingForTask = this.store.candidatesByTask(input.taskId)
    if (existingForTask.length >= input.maxCandidatesForTask) {
      throw new CandidateBudgetExceededError(
        `Task "${input.taskId}" already has ${existingForTask.length} candidates (max ${input.maxCandidatesForTask}).`,
      )
    }

    await runGitCommand(['add', '-A'], input.workspace.rootPath)
    const numstatResult = await runGitCommand(
      ['diff', '--cached', '--numstat'],
      input.workspace.rootPath,
    )
    const changedFiles = parseNumstat(numstatResult.stdout)
    if (changedFiles.length === 0) {
      throw new CandidateValidationError('Candidate has no changed files relative to its base SHA.')
    }

    const patchResult = await runGitCommand(['diff', '--cached'], input.workspace.rootPath)
    const candidateId = randomUUID()
    const patchDir = path.join(this.patchStoreRoot, '.symbolwright', 'orchestration', 'patches')
    mkdirSync(patchDir, { recursive: true, mode: 0o700 })
    const patchPath = path.join(patchDir, `${candidateId}.patch`)
    writeFileSync(patchPath, patchResult.stdout, 'utf8')

    if (input.correctsCandidateId !== undefined) {
      const prior = this.getCandidate(input.correctsCandidateId)
      this.store.candidates.write(prior.id, {
        ...prior,
        status: 'superseded',
        decidedAt: this.now().toISOString(),
        decisionRationale: `Superseded by correction ${candidateId}.`,
      })
    }

    const candidate: ChangeCandidate = {
      id: candidateId,
      missionId: input.missionId,
      teamId: input.teamId,
      taskId: input.taskId,
      agentId: input.agentId,
      submittedAt: this.now().toISOString(),
      baseSha: input.workspace.baseSha,
      workspaceId: input.workspace.id,
      ...(input.workspace.branchName === undefined
        ? {}
        : { branchName: input.workspace.branchName }),
      patchRef: patchPath,
      changedFiles,
      rationale: input.rationale,
      acceptanceEvidence: input.acceptanceEvidence ?? [],
      validationResults: input.validationResults ?? [],
      status: 'submitted',
      riskSummary: input.riskSummary ?? { level: 'medium', notes: [] },
      ...(input.correctsCandidateId === undefined
        ? {}
        : { correctsCandidateId: input.correctsCandidateId }),
    }
    this.store.candidates.write(candidateId, candidate)
    this.audit('candidate.submitted', input.teamId, input.missionId, input.agentId, candidateId)
    return candidate
  }

  public getCandidate(candidateId: string): ChangeCandidate {
    const candidate = this.store.candidates.read(candidateId)
    if (candidate === undefined)
      throw new CandidateValidationError(`No such candidate: ${candidateId}`)
    return candidate
  }

  public listForTeam(teamId: string): readonly ChangeCandidate[] {
    return this.store.candidatesByTeam(teamId)
  }

  public listForTask(taskId: string): readonly ChangeCandidate[] {
    return this.store.candidatesByTask(taskId)
  }

  public decide(
    candidateId: string,
    status: 'approved' | 'rejected',
    decidedBy: string,
    rationale: string,
  ): ChangeCandidate {
    const candidate = this.getCandidate(candidateId)
    const updated: ChangeCandidate = {
      ...candidate,
      status,
      decidedBy,
      decidedAt: this.now().toISOString(),
      decisionRationale: rationale,
    }
    this.store.candidates.write(candidateId, updated)
    this.audit(
      status === 'approved' ? 'candidate.accepted' : 'candidate.rejected',
      candidate.teamId,
      candidate.missionId,
      decidedBy,
      candidateId,
    )
    return updated
  }

  private audit(
    type: OrchestrationAuditEvent['type'],
    teamId: string,
    missionId: string,
    actorPrincipalId: string,
    candidateId: string,
  ): void {
    const event: OrchestrationAuditEvent = {
      id: randomUUID(),
      type,
      timestamp: this.now().toISOString(),
      missionId,
      teamId,
      candidateId,
      actorPrincipalId,
    }
    this.store.appendAudit(event)
  }
}
