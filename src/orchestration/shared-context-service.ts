import { randomUUID } from 'node:crypto'

import type { OrchestrationStore } from './orchestration-store.js'
import type { OrchestrationAuditEvent } from './orchestration-types.js'
import {
  AUTO_INFLUENTIAL_TRUST_STATUSES,
  type AddContextEntryInput,
  type ContextTrustStatus,
  type SharedContextCategory,
  type SharedContextEntry,
} from './shared-context-types.js'

export class SharedContextValidationError extends Error {}

const AUTHORITATIVE_ON_ENTRY_SOURCES = new Set(['operator', 'validation', 'policy'])

/**
 * Provenance-tracked shared mission knowledge (Section 13-14). An agent's own claim never
 * becomes authoritative just by being written here: only `operator`, `validation`, and `policy`
 * sourced entries can start `authoritative`; everything from `agent`/`tool-result`/`repository`
 * sources starts `unverified` and requires an explicit `promote`/`reject` decision recorded with
 * a rationale, so downstream planning can never be silently steered by prompt injection or a
 * hallucinated finding smuggled in through repository content or a peer message.
 */
export class SharedContextService {
  public constructor(
    private readonly store: OrchestrationStore,
    private readonly now: () => Date = () => new Date(),
  ) {}

  public addEntry(input: AddContextEntryInput): SharedContextEntry {
    if (
      input.initialTrustStatus === 'authoritative' &&
      !AUTHORITATIVE_ON_ENTRY_SOURCES.has(input.sourceType)
    ) {
      throw new SharedContextValidationError(
        `Only operator/validation/policy-sourced entries may be authoritative on entry (got source "${input.sourceType}").`,
      )
    }
    const trustStatus: ContextTrustStatus =
      input.initialTrustStatus ??
      (AUTHORITATIVE_ON_ENTRY_SOURCES.has(input.sourceType) ? 'authoritative' : 'unverified')

    const entry: SharedContextEntry = {
      id: randomUUID(),
      missionId: input.missionId,
      teamId: input.teamId,
      category: input.category,
      content: input.content,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      createdBy: input.createdBy,
      createdAt: this.now().toISOString(),
      trustStatus,
      evidenceRefs: [...(input.evidenceRefs ?? [])],
      ...(input.supersedes === undefined ? {} : { supersedes: [...input.supersedes] }),
    }
    this.store.contextEntries.write(entry.id, entry)
    this.audit('context.entry.added', input.teamId, input.missionId, input.createdBy, entry.id)
    return entry
  }

  public promote(
    entryId: string,
    decidedBy: string,
    rationale: string,
    targetCategory: SharedContextCategory = 'accepted-findings',
  ): SharedContextEntry {
    const entry = this.getEntry(entryId)
    const updated: SharedContextEntry = {
      ...entry,
      trustStatus: 'accepted',
      category: targetCategory,
      decidedBy,
      decidedAt: this.now().toISOString(),
      decisionRationale: rationale,
    }
    this.store.contextEntries.write(entryId, updated)
    this.audit('context.entry.promoted', entry.teamId, entry.missionId, decidedBy, entryId)
    return updated
  }

  public reject(entryId: string, decidedBy: string, rationale: string): SharedContextEntry {
    const entry = this.getEntry(entryId)
    const updated: SharedContextEntry = {
      ...entry,
      trustStatus: 'rejected',
      category: 'rejected-findings',
      decidedBy,
      decidedAt: this.now().toISOString(),
      decisionRationale: rationale,
    }
    this.store.contextEntries.write(entryId, updated)
    this.audit('context.entry.rejected', entry.teamId, entry.missionId, decidedBy, entryId)
    return updated
  }

  public getEntry(entryId: string): SharedContextEntry {
    const entry = this.store.contextEntries.read(entryId)
    if (entry === undefined)
      throw new SharedContextValidationError(`No such context entry: ${entryId}`)
    return entry
  }

  public listForTeam(teamId: string): readonly SharedContextEntry[] {
    return this.store.contextByTeam(teamId)
  }

  /** Only entries safe to feed into downstream planning/assignment automatically (Section 13). */
  public authoritativeContextForTeam(teamId: string): readonly SharedContextEntry[] {
    return this.store
      .contextByTeam(teamId)
      .filter((entry) => AUTO_INFLUENTIAL_TRUST_STATUSES.has(entry.trustStatus))
  }

  private audit(
    type: OrchestrationAuditEvent['type'],
    teamId: string,
    missionId: string,
    actorPrincipalId: string,
    contextEntryId: string,
  ): void {
    const event: OrchestrationAuditEvent = {
      id: randomUUID(),
      type,
      timestamp: this.now().toISOString(),
      missionId,
      teamId,
      actorPrincipalId,
      metadata: { contextEntryId },
    }
    this.store.appendAudit(event)
  }
}
