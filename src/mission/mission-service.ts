import { existsSync } from 'node:fs'
import path from 'node:path'

import type { ProviderMessage } from '../provider/provider.types.js'
import { runGitCommand } from '../runtime/git/git-command-runner.js'
import type { SymbolWrightRuntimeMode } from '../runtime/types.js'
import { createMissionEvent, recoverInterruptedMissionEvents } from './mission-events.js'
import { createMissionExportBundle, parseMissionExportBundle } from './mission-export.js'
import { generateMissionId } from './mission-id.js'
import { redactMissionText, sha256Text } from './mission-redaction.js'
import { MissionStore } from './mission-store.js'
import type {
  SymbolWrightMission,
  MissionCheckpointReference,
  MissionEvent,
  MissionExportBundle,
  MissionListResult,
  MissionMemoryReference,
  MissionRepositoryReconciliation,
  MissionStatus,
  MissionToolCallEvidence,
  MissionValidationEvidence,
  PersistedOpenFile,
} from './mission-types.js'
import type { CreateMissionInput, PatchMissionInput } from './mission-validation.js'

export class MissionNotFoundError extends Error {}

export class MissionRevisionConflictError extends Error {
  public constructor(public readonly current: SymbolWrightMission) {
    super('Mission changed since it was loaded')
  }
}

export class MissionStateConflictError extends Error {}

export interface MissionServiceOptions {
  readonly workspaceRoot: string
  readonly store?: MissionStore
  readonly env?: NodeJS.ProcessEnv
  readonly now?: () => Date
  readonly generateId?: () => string
}

function optionalString(value: string | null | undefined): string | undefined {
  return value === null || value === undefined || value.length === 0 ? undefined : value
}

function uniqueStrings(values: readonly string[]): readonly string[] {
  return [...new Set(values)]
}

function parseRepositoryName(remoteUrl: string | undefined): string | undefined {
  if (remoteUrl === undefined) return undefined
  const trimmed = remoteUrl.trim().replace(/\.git$/, '')
  const ssh = /^git@[^:]+:([^/]+\/.+)$/.exec(trimmed)
  if (ssh !== null) return ssh[1]
  try {
    const parsed = new URL(trimmed)
    const value = parsed.pathname.replace(/^\//, '')
    return value.length > 0 ? value : undefined
  } catch {
    return undefined
  }
}

export class MissionService {
  private readonly workspaceRoot: string
  private readonly store: MissionStore
  private readonly env: NodeJS.ProcessEnv
  private readonly now: () => Date
  private readonly generateId: () => string

  public constructor(options: MissionServiceOptions) {
    this.workspaceRoot = path.resolve(options.workspaceRoot)
    this.env = options.env ?? process.env
    this.now = options.now ?? (() => new Date())
    this.generateId = options.generateId ?? generateMissionId
    this.store =
      options.store ??
      new MissionStore({ workspaceRoot: this.workspaceRoot, env: this.env, now: this.now })
  }

  public getStore(): MissionStore {
    return this.store
  }

  public async create(input: CreateMissionInput): Promise<SymbolWrightMission> {
    const repositoryRoot = this.resolveRepositoryRoot(input.repositoryPath)
    const repository = await this.readRepositoryState(repositoryRoot)
    const now = this.now().toISOString()
    const mission: SymbolWrightMission = {
      schemaVersion: 1,
      revision: 1,
      id: this.generateId(),
      name: input.name,
      objective: input.objective,
      status: 'ACTIVE',
      createdAt: now,
      updatedAt: now,
      lastOpenedAt: now,
      repository: {
        rootPath: repositoryRoot,
        ...(repository.repositoryName === undefined
          ? {}
          : { repositoryName: repository.repositoryName }),
        ...(repository.remoteUrl === undefined ? {} : { remoteUrl: repository.remoteUrl }),
        ...(repository.branch === undefined ? {} : { branch: repository.branch }),
        ...(repository.headSha === undefined
          ? {}
          : { baseSha: repository.headSha, headSha: repository.headSha }),
        modifiedPaths: repository.modifiedPaths,
      },
      agent: {
        runtimeMode: input.runtimeMode,
        ...(input.activeProviderId === undefined
          ? {}
          : { activeProviderId: input.activeProviderId }),
        ...(input.model === undefined ? {} : { model: input.model }),
        messages: [],
      },
      workspace: {
        kind: input.workspaceKind,
        openFiles: [],
        scratchAttached: false,
      },
      evidence: {
        toolCalls: [],
        validationRuns: [],
        webAccesses: [],
        mcpCalls: [],
        subagentRuns: [],
        skillRuns: [],
      },
      references: {
        checkpointIds: [],
        checkpointLinks: [],
        memoryEntryIds: [],
        memoryLinks: [],
        commitShas: [],
        pullRequestUrls: [],
      },
      labels: input.labels,
      ...(input.notes === undefined ? {} : { notes: input.notes }),
    }
    this.store.createMission(mission)
    this.appendEvent(mission.id, 'mission.created', `Mission created: ${mission.name}`, {
      workspaceKind: mission.workspace.kind,
      repositoryRoot: mission.repository.rootPath,
    })
    return mission
  }

  public get(missionId: string): SymbolWrightMission {
    const mission = this.store.readMission(missionId)
    if (mission === undefined) throw new MissionNotFoundError(`Mission not found: ${missionId}`)
    return mission
  }

  public list(
    options: { readonly offset?: number; readonly limit?: number } = {},
  ): MissionListResult {
    return this.store.listMissions(options)
  }

  public patch(missionId: string, input: PatchMissionInput): SymbolWrightMission {
    return this.update(missionId, input.revision, (mission) => {
      const repositoryPatch = input.repository
      const repository = {
        ...mission.repository,
        ...(repositoryPatch?.rootPath === undefined
          ? {}
          : { rootPath: this.resolveRepositoryRoot(repositoryPatch.rootPath) }),
        ...(repositoryPatch?.repositoryName === undefined
          ? {}
          : repositoryPatch.repositoryName === null
            ? { repositoryName: undefined }
            : { repositoryName: repositoryPatch.repositoryName }),
        ...(repositoryPatch?.remoteUrl === undefined
          ? {}
          : repositoryPatch.remoteUrl === null
            ? { remoteUrl: undefined }
            : { remoteUrl: repositoryPatch.remoteUrl }),
        ...(repositoryPatch?.branch === undefined
          ? {}
          : repositoryPatch.branch === null
            ? { branch: undefined }
            : { branch: repositoryPatch.branch }),
        ...(repositoryPatch?.baseSha === undefined
          ? {}
          : repositoryPatch.baseSha === null
            ? { baseSha: undefined }
            : { baseSha: repositoryPatch.baseSha }),
        ...(repositoryPatch?.headSha === undefined
          ? {}
          : repositoryPatch.headSha === null
            ? { headSha: undefined }
            : { headSha: repositoryPatch.headSha }),
        ...(repositoryPatch?.modifiedPaths === undefined
          ? {}
          : { modifiedPaths: uniqueStrings(repositoryPatch.modifiedPaths) }),
      }

      const agent = {
        ...mission.agent,
        ...(input.runtimeMode === undefined ? {} : { runtimeMode: input.runtimeMode }),
        ...(input.activeProviderId === undefined
          ? {}
          : input.activeProviderId === null
            ? { activeProviderId: undefined }
            : { activeProviderId: input.activeProviderId }),
        ...(input.model === undefined
          ? {}
          : input.model === null
            ? { model: undefined }
            : { model: input.model }),
      }

      const workspace = {
        ...mission.workspace,
        ...(input.workspaceKind === undefined ? {} : { kind: input.workspaceKind }),
        ...(input.activeFilePath === undefined
          ? {}
          : input.activeFilePath === null
            ? { activeFilePath: undefined }
            : { activeFilePath: input.activeFilePath }),
        ...(input.selectedDiffPath === undefined
          ? {}
          : input.selectedDiffPath === null
            ? { selectedDiffPath: undefined }
            : { selectedDiffPath: input.selectedDiffPath }),
      }

      return {
        ...mission,
        ...(input.name === undefined ? {} : { name: input.name }),
        ...(input.objective === undefined ? {} : { objective: input.objective }),
        repository,
        agent,
        workspace,
        ...(input.labels === undefined ? {} : { labels: uniqueStrings(input.labels) }),
        ...(input.notes === undefined
          ? {}
          : input.notes === null
            ? { notes: undefined }
            : { notes: input.notes }),
      }
    })
  }

  public pause(missionId: string, revision: number): SymbolWrightMission {
    return this.transition(missionId, revision, 'PAUSED', 'mission.paused', 'Mission paused.')
  }

  public resume(missionId: string, revision: number): SymbolWrightMission {
    const mission = this.get(missionId)
    if (mission.status !== 'PAUSED') {
      throw new MissionStateConflictError('Only a paused mission can be resumed')
    }
    const interruptions = recoverInterruptedMissionEvents(
      missionId,
      this.store.readEvents(missionId),
      this.now().toISOString(),
    )
    for (const event of interruptions) this.store.appendEvent(event)
    const resumed = this.update(missionId, revision, (current) => ({
      ...current,
      status: 'ACTIVE',
      lastOpenedAt: this.now().toISOString(),
    }))
    this.appendEvent(missionId, 'mission.resumed', 'Mission resumed.')
    return resumed
  }

  public reopenCompleted(missionId: string, revision: number): SymbolWrightMission {
    const mission = this.get(missionId)
    if (mission.status !== 'COMPLETED') {
      throw new MissionStateConflictError('Only a completed mission can be explicitly reopened')
    }
    const reopened = this.update(missionId, revision, (current) => ({
      ...current,
      status: 'ACTIVE',
      lastOpenedAt: this.now().toISOString(),
    }))
    this.appendEvent(missionId, 'mission.reopened', 'Completed mission explicitly reopened.')
    return reopened
  }

  public complete(missionId: string, revision: number): SymbolWrightMission {
    return this.transition(
      missionId,
      revision,
      'COMPLETED',
      'mission.completed',
      'Mission completed.',
    )
  }

  public abandon(missionId: string, revision: number): SymbolWrightMission {
    return this.transition(
      missionId,
      revision,
      'ABANDONED',
      'mission.abandoned',
      'Mission abandoned.',
    )
  }

  public fail(missionId: string, revision: number, summary: string): SymbolWrightMission {
    return this.transition(missionId, revision, 'FAILED', 'mission.failed', summary)
  }

  public delete(missionId: string, revision: number, confirm: boolean): void {
    if (!confirm)
      throw new MissionStateConflictError('confirm: true is required to delete a mission')
    const mission = this.get(missionId)
    if (mission.revision !== revision) throw new MissionRevisionConflictError(mission)
    this.store.deleteMission(missionId)
  }

  public appendEvent(
    missionId: string,
    type: string,
    summary: string,
    payload?: unknown,
  ): MissionEvent {
    this.get(missionId)
    const event = createMissionEvent(
      {
        missionId,
        type,
        summary,
        ...(payload === undefined ? {} : { payload }),
        timestamp: this.now().toISOString(),
      },
      this.env,
    )
    this.store.appendEvent(event)
    return event
  }

  public readEvents(missionId: string): readonly MissionEvent[] {
    this.get(missionId)
    return this.store.readEvents(missionId)
  }

  public recordAgentUserMessage(
    missionId: string,
    message: string,
    runtimeMode: SymbolWrightRuntimeMode,
    providerId: string,
    model?: string,
  ): SymbolWrightMission {
    const mission = this.updateLatest(missionId, (current) => ({
      ...current,
      agent: {
        ...current.agent,
        runtimeMode,
        activeProviderId: providerId,
        ...(model === undefined ? {} : { model }),
        messages: [
          ...current.agent.messages,
          { role: 'user', content: redactMissionText(message, this.env, 64_000) },
        ],
      },
    }))
    this.appendEvent(missionId, 'agent.message.user', 'User message recorded.', {
      characterCount: message.length,
    })
    return mission
  }

  public recordAgentResult(
    missionId: string,
    finalMessages: readonly ProviderMessage[] | undefined,
    finalText: string,
    status: string,
  ): SymbolWrightMission {
    const updated = this.updateLatest(missionId, (current) => ({
      ...current,
      agent: {
        ...current.agent,
        messages:
          finalMessages === undefined
            ? [
                ...current.agent.messages,
                { role: 'assistant', content: redactMissionText(finalText, this.env, 64_000) },
              ]
            : finalMessages,
      },
    }))
    this.appendEvent(
      missionId,
      status === 'error' ? 'agent.message.failed' : 'agent.message.assistant',
      status === 'error' ? 'Agent turn failed.' : 'Assistant response recorded.',
      { status, characterCount: finalText.length },
    )
    return updated
  }

  public recordToolStarted(missionId: string, toolCallId: string, toolName: string): void {
    const startedAt = this.now().toISOString()
    const evidence: MissionToolCallEvidence = {
      id: toolCallId,
      toolName,
      startedAt,
      status: 'running',
      summary: `${toolName} started`,
    }
    this.updateLatest(missionId, (mission) => ({
      ...mission,
      evidence: { ...mission.evidence, toolCalls: [...mission.evidence.toolCalls, evidence] },
    }))
    this.appendEvent(missionId, 'agent.tool.started', `${toolName} started.`, {
      operationId: toolCallId,
      toolCallId,
      toolName,
    })
  }

  public recordToolCompleted(
    missionId: string,
    toolCallId: string,
    toolName: string,
    output: string,
    isError: boolean,
    durationMs: number,
  ): void {
    const completedAt = this.now().toISOString()
    const outputExcerpt = redactMissionText(output, this.env, 4_000)
    this.updateLatest(missionId, (mission) => ({
      ...mission,
      evidence: {
        ...mission.evidence,
        toolCalls: mission.evidence.toolCalls.map((entry) =>
          entry.id === toolCallId
            ? {
                ...entry,
                completedAt,
                status: isError ? 'failed' : 'passed',
                summary: `${toolName} ${isError ? 'failed' : 'completed'}`,
                outputExcerpt,
                outputHash: sha256Text(output),
                durationMs,
              }
            : entry,
        ),
      },
    }))
    this.appendEvent(
      missionId,
      isError ? 'agent.tool.failed' : 'agent.tool.completed',
      `${toolName} ${isError ? 'failed' : 'completed'}.`,
      {
        operationId: toolCallId,
        toolCallId,
        toolName,
        isError,
        durationMs,
        outputExcerpt,
        outputHash: sha256Text(output),
      },
    )
    this.captureMemoryReferenceFromToolOutput(missionId, toolName, output)
  }

  public recordFileOpened(missionId: string, filePath: string, contentHash?: string): void {
    const openedAt = this.now().toISOString()
    this.updateLatest(missionId, (mission) => {
      const existing = mission.workspace.openFiles.filter((entry) => entry.path !== filePath)
      const openFile: PersistedOpenFile = {
        path: filePath,
        openedAt,
        ...(contentHash === undefined ? {} : { contentHash }),
        exists: true,
      }
      return {
        ...mission,
        workspace: {
          ...mission.workspace,
          kind: 'repository',
          openFiles: [...existing, openFile],
          activeFilePath: filePath,
        },
      }
    })
    this.appendEvent(missionId, 'workspace.file.opened', `Opened ${filePath}.`, { path: filePath })
  }

  public recordFileSaved(
    missionId: string,
    filePath: string,
    contentHash: string,
    checkpoint?: MissionCheckpointReference,
  ): void {
    this.updateLatest(missionId, (mission) => ({
      ...mission,
      repository: {
        ...mission.repository,
        modifiedPaths: uniqueStrings([...mission.repository.modifiedPaths, filePath]),
      },
      workspace: {
        ...mission.workspace,
        activeFilePath: filePath,
        openFiles: mission.workspace.openFiles.map((entry) =>
          entry.path === filePath ? { ...entry, contentHash, exists: true } : entry,
        ),
      },
    }))
    this.appendEvent(missionId, 'workspace.file.saved', `Saved ${filePath}.`, {
      path: filePath,
      contentHash,
    })
    if (checkpoint !== undefined) this.attachCheckpoint(missionId, checkpoint)
  }

  public recordFileConflict(missionId: string, filePath: string): void {
    this.appendEvent(missionId, 'workspace.file.conflict', `Save conflict for ${filePath}.`, {
      path: filePath,
    })
  }

  public recordDiffViewed(missionId: string, filePath: string): void {
    this.updateLatest(missionId, (mission) => ({
      ...mission,
      workspace: { ...mission.workspace, selectedDiffPath: filePath },
    }))
    this.appendEvent(missionId, 'workspace.diff.viewed', `Viewed diff for ${filePath}.`, {
      path: filePath,
    })
  }

  public recordRepositoryState(
    missionId: string,
    state: {
      readonly branch?: string
      readonly headSha?: string
      readonly modifiedPaths?: readonly string[]
    },
  ): SymbolWrightMission {
    return this.updateLatest(missionId, (mission) => ({
      ...mission,
      repository: {
        ...mission.repository,
        ...(state.branch === undefined ? {} : { branch: state.branch }),
        ...(state.headSha === undefined ? {} : { headSha: state.headSha }),
        ...(state.modifiedPaths === undefined
          ? {}
          : { modifiedPaths: uniqueStrings(state.modifiedPaths) }),
      },
    }))
  }

  public recordBranchChanged(missionId: string, branch: string, headSha?: string): void {
    this.recordRepositoryState(missionId, { branch, ...(headSha === undefined ? {} : { headSha }) })
    this.appendEvent(missionId, 'git.branch.changed', `Repository branch changed to ${branch}.`, {
      branch,
      ...(headSha === undefined ? {} : { headSha }),
    })
  }

  public recordCommit(missionId: string, commitSha: string, summary: string): void {
    this.updateLatest(missionId, (mission) => ({
      ...mission,
      repository: { ...mission.repository, headSha: commitSha, modifiedPaths: [] },
      references: {
        ...mission.references,
        commitShas: uniqueStrings([...mission.references.commitShas, commitSha]),
      },
    }))
    this.appendEvent(missionId, 'git.commit.created', summary, { commitSha })
  }

  public recordPush(missionId: string, branch: string, remote: string): void {
    this.appendEvent(missionId, 'git.push.completed', `Pushed ${branch} to ${remote}.`, {
      branch,
      remote,
    })
  }

  public recordPullRequest(missionId: string, pullRequestUrl: string): void {
    this.updateLatest(missionId, (mission) => ({
      ...mission,
      references: {
        ...mission.references,
        pullRequestUrls: uniqueStrings([...mission.references.pullRequestUrls, pullRequestUrl]),
      },
    }))
    this.appendEvent(missionId, 'github.pr.created', 'Pull request created.', { pullRequestUrl })
  }

  public attachCheckpoint(missionId: string, reference: MissionCheckpointReference): void {
    this.updateLatest(missionId, (mission) => ({
      ...mission,
      references: {
        ...mission.references,
        checkpointIds: uniqueStrings([...mission.references.checkpointIds, reference.checkpointId]),
        checkpointLinks: [
          ...mission.references.checkpointLinks.filter(
            (entry) => entry.checkpointId !== reference.checkpointId,
          ),
          reference,
        ],
      },
    }))
    this.appendEvent(
      missionId,
      'checkpoint.created',
      `Checkpoint ${reference.checkpointId} linked.`,
      {
        checkpointId: reference.checkpointId,
        paths: reference.paths,
        ...(reference.label === undefined ? {} : { label: reference.label }),
      },
    )
  }

  public labelCheckpoint(
    missionId: string,
    checkpointId: string,
    label: string,
  ): SymbolWrightMission {
    return this.updateLatest(missionId, (mission) => ({
      ...mission,
      references: {
        ...mission.references,
        checkpointLinks: mission.references.checkpointLinks.map((entry) =>
          entry.checkpointId === checkpointId ? { ...entry, label } : entry,
        ),
      },
    }))
  }

  public recordCheckpointRestored(missionId: string, checkpointId: string): void {
    this.appendEvent(missionId, 'checkpoint.restored', `Checkpoint ${checkpointId} restored.`, {
      checkpointId,
    })
  }

  public recordValidation(missionId: string, evidence: MissionValidationEvidence): void {
    this.updateLatest(missionId, (mission) => ({
      ...mission,
      evidence: {
        ...mission.evidence,
        validationRuns: [
          ...mission.evidence.validationRuns.filter((entry) => entry.id !== evidence.id),
          evidence,
        ],
      },
    }))
    const terminal =
      evidence.status === 'running'
        ? 'started'
        : evidence.status === 'passed'
          ? 'completed'
          : evidence.status
    this.appendEvent(missionId, `validation.${terminal}`, evidence.summary, {
      operationId: evidence.id,
      validationId: evidence.id,
      ...evidence,
    })
  }

  public attachScratchWorkspace(
    missionId: string,
    revision: number,
    scratchState: Record<string, unknown>,
  ): SymbolWrightMission {
    const updated = this.update(missionId, revision, (mission) => ({
      ...mission,
      workspace: {
        ...mission.workspace,
        kind: 'scratch',
        scratchAttached: true,
        scratchState,
      },
    }))
    this.appendEvent(
      missionId,
      'workspace.scratch.attached',
      'Scratch Workspace attached to mission.',
    )
    return updated
  }

  public export(missionId: string): MissionExportBundle {
    const mission = this.get(missionId)
    return createMissionExportBundle(
      mission,
      this.store.readEvents(missionId),
      { exportedAt: this.now().toISOString() },
      this.env,
    )
  }

  public import(raw: unknown): SymbolWrightMission {
    const bundle = parseMissionExportBundle(raw, this.env)
    const now = this.now().toISOString()
    const newId = this.generateId()
    const imported: SymbolWrightMission = {
      ...bundle.mission,
      id: newId,
      revision: 1,
      status: 'PAUSED',
      createdAt: now,
      updatedAt: now,
      lastOpenedAt: now,
      importedFrom: {
        originalMissionId: bundle.mission.id,
        importedAt: now,
        exportedAt: bundle.exportedAt,
      },
    }
    this.store.createMission(imported)
    for (const event of bundle.events) {
      this.store.appendEvent(
        createMissionEvent(
          {
            missionId: newId,
            type: event.type,
            timestamp: event.timestamp,
            summary: event.summary,
            ...(event.payload === undefined ? {} : { payload: event.payload }),
          },
          this.env,
        ),
      )
    }
    this.appendEvent(newId, 'mission.imported', `Mission imported from ${bundle.mission.id}.`, {
      originalMissionId: bundle.mission.id,
      exportedAt: bundle.exportedAt,
    })
    return imported
  }

  public async reconcileRepository(missionId: string): Promise<MissionRepositoryReconciliation> {
    const mission = this.get(missionId)
    const root = mission.repository.rootPath
    if (!existsSync(root)) {
      return {
        repositoryAvailable: false,
        ...(mission.repository.branch === undefined
          ? {}
          : { recordedBranch: mission.repository.branch }),
        ...(mission.repository.headSha === undefined
          ? {}
          : { recordedHeadSha: mission.repository.headSha }),
        hasDrift: true,
        warnings: [
          'Repository path is unavailable. Agent history and evidence are still accessible.',
        ],
      }
    }

    const state = await this.readRepositoryState(root)
    const branchExists =
      mission.repository.branch === undefined
        ? undefined
        : (
            await runGitCommand(
              ['show-ref', '--verify', '--quiet', `refs/heads/${mission.repository.branch}`],
              root,
            )
          ).exitCode === 0
    const warnings: string[] = []
    if (mission.repository.branch !== undefined && state.branch !== mission.repository.branch) {
      warnings.push(
        `Recorded branch: ${mission.repository.branch}; current branch: ${state.branch ?? '(detached HEAD)'}.`,
      )
    }
    if (mission.repository.headSha !== undefined && state.headSha !== mission.repository.headSha) {
      warnings.push(
        `Recorded HEAD: ${mission.repository.headSha}; current HEAD: ${state.headSha ?? '(unavailable)'}.`,
      )
    }
    if (branchExists === false) warnings.push('The recorded branch no longer exists locally.')

    return {
      repositoryAvailable: true,
      ...(mission.repository.branch === undefined
        ? {}
        : { recordedBranch: mission.repository.branch }),
      ...(state.branch === undefined ? {} : { currentBranch: state.branch }),
      ...(mission.repository.headSha === undefined
        ? {}
        : { recordedHeadSha: mission.repository.headSha }),
      ...(state.headSha === undefined ? {} : { currentHeadSha: state.headSha }),
      ...(branchExists === undefined ? {} : { branchExists }),
      hasDrift: warnings.length > 0,
      warnings,
    }
  }

  private transition(
    missionId: string,
    revision: number,
    status: MissionStatus,
    eventType: string,
    summary: string,
  ): SymbolWrightMission {
    const current = this.get(missionId)
    if (current.status === 'COMPLETED' || current.status === 'ABANDONED') {
      throw new MissionStateConflictError(
        'Completed and abandoned missions are immutable unless explicitly reopened where supported.',
      )
    }
    const updated = this.update(missionId, revision, (mission) => ({ ...mission, status }))
    this.appendEvent(missionId, eventType, summary)
    return updated
  }

  private update(
    missionId: string,
    expectedRevision: number,
    mutator: (mission: SymbolWrightMission) => SymbolWrightMission,
  ): SymbolWrightMission {
    const current = this.get(missionId)
    if (current.revision !== expectedRevision) throw new MissionRevisionConflictError(current)
    const updated = mutator(current)
    const finalMission: SymbolWrightMission = {
      ...updated,
      revision: current.revision + 1,
      updatedAt: this.now().toISOString(),
    }
    this.store.writeMission(finalMission)
    return finalMission
  }

  private updateLatest(
    missionId: string,
    mutator: (mission: SymbolWrightMission) => SymbolWrightMission,
  ): SymbolWrightMission {
    const current = this.get(missionId)
    return this.update(missionId, current.revision, mutator)
  }

  private resolveRepositoryRoot(requestedPath: string): string {
    const resolved = path.resolve(this.workspaceRoot, requestedPath)
    if (
      resolved !== this.workspaceRoot &&
      !resolved.startsWith(`${this.workspaceRoot}${path.sep}`)
    ) {
      throw new MissionStateConflictError(
        'Repository path must stay inside the SymbolWright workspace',
      )
    }
    return resolved
  }

  private async readRepositoryState(repositoryRoot: string): Promise<{
    readonly repositoryName?: string
    readonly remoteUrl?: string
    readonly branch?: string
    readonly headSha?: string
    readonly modifiedPaths: readonly string[]
  }> {
    if (!existsSync(repositoryRoot)) return { modifiedPaths: [] }
    const [remote, branch, head, status] = await Promise.all([
      runGitCommand(['remote', 'get-url', 'origin'], repositoryRoot),
      runGitCommand(['branch', '--show-current'], repositoryRoot),
      runGitCommand(['rev-parse', 'HEAD'], repositoryRoot),
      runGitCommand(['status', '--porcelain=v1'], repositoryRoot),
    ])
    const remoteUrl = remote.exitCode === 0 ? remote.stdout.trim() : undefined
    const branchName = branch.exitCode === 0 ? optionalString(branch.stdout.trim()) : undefined
    const headSha = head.exitCode === 0 ? optionalString(head.stdout.trim()) : undefined
    const modifiedPaths =
      status.exitCode === 0
        ? status.stdout
            .split('\n')
            .map((line) => line.slice(3).trim())
            .filter(
              (entry) =>
                entry.length > 0 &&
                !entry.startsWith('.symbolwright/') &&
                !entry.startsWith('.symbolwright/'),
            )
        : []
    return {
      ...(remoteUrl === undefined || remoteUrl.length === 0 ? {} : { remoteUrl }),
      ...(parseRepositoryName(remoteUrl) === undefined
        ? {}
        : { repositoryName: parseRepositoryName(remoteUrl) as string }),
      ...(branchName === undefined ? {} : { branch: branchName }),
      ...(headSha === undefined ? {} : { headSha }),
      modifiedPaths: uniqueStrings(modifiedPaths),
    }
  }

  private captureMemoryReferenceFromToolOutput(
    missionId: string,
    toolName: string,
    output: string,
  ): void {
    if (toolName !== 'memory_store' && toolName !== 'memory_recall') return
    const timestamp = this.now().toISOString()
    const storedMatch = /Memory stored successfully with ID:\s*([^\s]+)/i.exec(output)
    const recalledIds = [...output.matchAll(/\[(?:EPISODIC|LEXICAL|GRAPH):([^\]]+)\]/gi)]
      .map((match) => match[1])
      .filter((value): value is string => value !== undefined)
    const links: MissionMemoryReference[] = []
    if (storedMatch?.[1] !== undefined) {
      links.push({
        memoryEntryId: storedMatch[1],
        kind: 'episodic',
        action: 'stored',
        timestamp,
        summary: 'Memory stored by agent tool.',
      })
    }
    for (const memoryEntryId of recalledIds) {
      links.push({
        memoryEntryId,
        kind: 'episodic',
        action: 'recalled',
        timestamp,
        summary: 'Memory recalled by agent tool.',
      })
    }
    if (links.length === 0) return
    this.updateLatest(missionId, (mission) => ({
      ...mission,
      references: {
        ...mission.references,
        memoryEntryIds: uniqueStrings([
          ...mission.references.memoryEntryIds,
          ...links.map((entry) => entry.memoryEntryId),
        ]),
        memoryLinks: [...mission.references.memoryLinks, ...links],
      },
    }))
    for (const link of links) {
      this.appendEvent(
        missionId,
        link.action === 'stored' ? 'memory.stored' : 'memory.recalled',
        link.summary,
        link,
      )
    }
  }
}
