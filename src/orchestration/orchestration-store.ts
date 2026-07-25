import {
  closeSync,
  copyFileSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import path from 'node:path'

import type { AgentTeam, AgentTeamMember, OrchestrationAuditEvent } from './orchestration-types.js'
import type { CollaborativeTask, AgentAssignmentDecision } from './collaborative-task-types.js'
import type { AgentWorkspace } from './agent-workspace-types.js'
import type { SharedContextEntry, CollaborationMessage } from './shared-context-types.js'
import type { ChangeCandidate, CandidateReview, IntegrationPlan } from './change-candidate-types.js'

const VALID_ID_PATTERN = /^[a-zA-Z0-9_-]{1,128}$/

function assertValidId(id: string, label: string): void {
  if (!VALID_ID_PATTERN.test(id)) {
    throw new Error(`Invalid ${label}: ${id}`)
  }
}

/**
 * Atomic temp-file+rename JSON store — the same durability pattern as `MissionStore` and
 * `AccessStore`: a crash mid-write never corrupts the previous durable snapshot (Section 3/31 of
 * the mission brief). Reimplemented locally rather than imported from `src/access/access-store.ts`
 * because that class is module-private there, matching how `MissionStore` also owns its own copy.
 */
class AtomicJsonDirectory<T> {
  public constructor(private readonly dir: string) {
    mkdirSync(this.dir, { recursive: true, mode: 0o700 })
  }

  public write(id: string, value: T): void {
    assertValidId(id, 'record id')
    const targetPath = this.pathFor(id)
    mkdirSync(this.dir, { recursive: true, mode: 0o700 })
    const tempPath = `${targetPath}.tmp-${process.pid}-${Math.random().toString(36).slice(2)}`
    const fd = openSync(tempPath, 'w', 0o600)
    try {
      writeFileSync(fd, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
      fsyncSync(fd)
    } finally {
      closeSync(fd)
    }
    if (existsSync(targetPath)) copyFileSync(targetPath, `${targetPath}.previous`)
    renameSync(tempPath, targetPath)
  }

  public read(id: string): T | undefined {
    assertValidId(id, 'record id')
    const targetPath = this.pathFor(id)
    if (!existsSync(targetPath)) return undefined
    try {
      return JSON.parse(readFileSync(targetPath, 'utf8')) as T
    } catch {
      const previousPath = `${targetPath}.previous`
      if (existsSync(previousPath)) {
        try {
          return JSON.parse(readFileSync(previousPath, 'utf8')) as T
        } catch {
          return undefined
        }
      }
      return undefined
    }
  }

  public list(): T[] {
    if (!existsSync(this.dir)) return []
    const entries: T[] = []
    for (const fileName of readdirSync(this.dir)) {
      if (!fileName.endsWith('.json')) continue
      const value = this.read(fileName.slice(0, -'.json'.length))
      if (value !== undefined) entries.push(value)
    }
    return entries
  }

  public remove(id: string): void {
    assertValidId(id, 'record id')
    const targetPath = this.pathFor(id)
    for (const candidate of [targetPath, `${targetPath}.previous`]) {
      if (existsSync(candidate)) rmSync(candidate, { force: true })
    }
  }

  private pathFor(id: string): string {
    return path.join(this.dir, `${id}.json`)
  }
}

export interface OrchestrationStoreOptions {
  readonly workspaceRoot: string
}

/** Durable persistence for every orchestration entity, under `.symbolwright/orchestration/`. */
export class OrchestrationStore {
  public readonly teams: AtomicJsonDirectory<AgentTeam>
  public readonly members: AtomicJsonDirectory<AgentTeamMember>
  public readonly tasks: AtomicJsonDirectory<CollaborativeTask>
  public readonly assignmentDecisions: AtomicJsonDirectory<AgentAssignmentDecision>
  public readonly workspaces: AtomicJsonDirectory<AgentWorkspace>
  public readonly contextEntries: AtomicJsonDirectory<SharedContextEntry>
  public readonly messages: AtomicJsonDirectory<CollaborationMessage>
  public readonly candidates: AtomicJsonDirectory<ChangeCandidate>
  public readonly reviews: AtomicJsonDirectory<CandidateReview>
  public readonly integrations: AtomicJsonDirectory<IntegrationPlan>
  private readonly auditLogPath: string

  public constructor(options: OrchestrationStoreOptions) {
    const root = path.join(path.resolve(options.workspaceRoot), '.symbolwright', 'orchestration')
    this.teams = new AtomicJsonDirectory(path.join(root, 'teams'))
    this.members = new AtomicJsonDirectory(path.join(root, 'members'))
    this.tasks = new AtomicJsonDirectory(path.join(root, 'tasks'))
    this.assignmentDecisions = new AtomicJsonDirectory(path.join(root, 'assignment-decisions'))
    this.workspaces = new AtomicJsonDirectory(path.join(root, 'workspaces'))
    this.contextEntries = new AtomicJsonDirectory(path.join(root, 'context-entries'))
    this.messages = new AtomicJsonDirectory(path.join(root, 'messages'))
    this.candidates = new AtomicJsonDirectory(path.join(root, 'candidates'))
    this.reviews = new AtomicJsonDirectory(path.join(root, 'reviews'))
    this.integrations = new AtomicJsonDirectory(path.join(root, 'integrations'))
    mkdirSync(path.join(root, 'audit'), { recursive: true, mode: 0o700 })
    this.auditLogPath = path.join(root, 'audit', 'events.jsonl')
  }

  public membersByTeam(teamId: string): AgentTeamMember[] {
    return this.members.list().filter((member) => member.teamId === teamId)
  }

  public tasksByTeam(teamId: string): CollaborativeTask[] {
    return this.tasks.list().filter((task) => task.teamId === teamId)
  }

  public candidatesByTeam(teamId: string): ChangeCandidate[] {
    return this.candidates.list().filter((candidate) => candidate.teamId === teamId)
  }

  public candidatesByTask(taskId: string): ChangeCandidate[] {
    return this.candidates.list().filter((candidate) => candidate.taskId === taskId)
  }

  public reviewsByCandidate(candidateId: string): CandidateReview[] {
    return this.reviews.list().filter((review) => review.candidateId === candidateId)
  }

  public contextByTeam(teamId: string): SharedContextEntry[] {
    return this.contextEntries.list().filter((entry) => entry.teamId === teamId)
  }

  public messagesByTeam(teamId: string): CollaborationMessage[] {
    return this.messages.list().filter((message) => message.teamId === teamId)
  }

  /** Append-only audit trail — never rewritten, mirrors `AccessStore`'s audit log. */
  public appendAudit(event: OrchestrationAuditEvent): void {
    const fd = openSync(this.auditLogPath, 'a', 0o600)
    try {
      writeFileSync(fd, `${JSON.stringify(event)}\n`, 'utf8')
      fsyncSync(fd)
    } finally {
      closeSync(fd)
    }
  }

  public listAudit(): OrchestrationAuditEvent[] {
    if (!existsSync(this.auditLogPath)) return []
    return readFileSync(this.auditLogPath, 'utf8')
      .split('\n')
      .filter((line) => line.trim().length > 0)
      .map((line) => JSON.parse(line) as OrchestrationAuditEvent)
  }
}
