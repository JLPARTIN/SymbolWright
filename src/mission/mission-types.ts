import type { ProviderMessage } from '../provider/provider.types.js'
import type { CodemindRuntimeMode } from '../runtime/types.js'

export const CURRENT_MISSION_SCHEMA_VERSION = 1 as const

export const MISSION_STATUSES = ['ACTIVE', 'PAUSED', 'COMPLETED', 'ABANDONED', 'FAILED'] as const
export type MissionStatus = (typeof MISSION_STATUSES)[number]

export type PersistedAgentMessage = ProviderMessage

export interface PersistedAgentDraft {
  readonly text: string
  readonly source: 'workspace' | 'repository' | 'manual'
  readonly createdAt: string
}

export interface PersistedOpenFile {
  readonly path: string
  readonly openedAt: string
  readonly contentHash?: string
  readonly exists?: boolean
}

export interface MissionToolCallEvidence {
  readonly id: string
  readonly toolName: string
  readonly startedAt: string
  readonly completedAt?: string
  readonly status: 'running' | 'passed' | 'failed' | 'blocked' | 'interrupted'
  readonly summary: string
  readonly outputExcerpt?: string
  readonly outputHash?: string
  readonly durationMs?: number
}

export interface MissionValidationEvidence {
  readonly id: string
  readonly command: string
  readonly startedAt: string
  readonly completedAt?: string
  readonly exitCode?: number
  readonly status: 'running' | 'passed' | 'failed' | 'blocked' | 'interrupted'
  readonly summary: string
  readonly outputExcerpt?: string
  readonly outputHash?: string
}

export interface MissionWebEvidence {
  readonly id: string
  readonly timestamp: string
  readonly url?: string
  readonly method?: string
  readonly status?: number
  readonly summary: string
}

export interface MissionMcpEvidence {
  readonly id: string
  readonly timestamp: string
  readonly serverName?: string
  readonly toolName?: string
  readonly status: 'passed' | 'failed' | 'blocked' | 'interrupted'
  readonly summary: string
}

export interface MissionSubagentEvidence {
  readonly id: string
  readonly timestamp: string
  readonly status: 'running' | 'passed' | 'failed' | 'interrupted'
  readonly summary: string
}

export interface MissionSkillEvidence {
  readonly id: string
  readonly timestamp: string
  readonly skillName?: string
  readonly status: 'running' | 'passed' | 'failed' | 'interrupted'
  readonly summary: string
}

export interface MissionCheckpointReference {
  readonly checkpointId: string
  readonly createdAt: string
  readonly paths: readonly string[]
  readonly triggeringToolCallId?: string
  readonly label?: string
}

export interface MissionMemoryReference {
  readonly memoryEntryId: string
  readonly kind: 'episodic' | 'lexical' | 'procedural' | 'graph'
  readonly action: 'stored' | 'recalled'
  readonly timestamp: string
  readonly summary: string
}

export interface MissionImportedSource {
  readonly importedAt: string
  readonly exportedAt?: string
  readonly originalMissionId: string
}

export interface CodeMindMission {
  readonly schemaVersion: typeof CURRENT_MISSION_SCHEMA_VERSION
  readonly revision: number
  readonly id: string
  readonly name: string
  readonly objective: string
  readonly status: MissionStatus
  readonly createdAt: string
  readonly updatedAt: string
  readonly lastOpenedAt: string
  readonly repository: {
    readonly rootPath: string
    readonly repositoryName?: string
    readonly remoteUrl?: string
    readonly branch?: string
    readonly baseSha?: string
    readonly headSha?: string
    readonly modifiedPaths: readonly string[]
  }
  readonly agent: {
    readonly runtimeMode: CodemindRuntimeMode
    readonly activeProviderId?: string
    readonly model?: string
    readonly messages: readonly PersistedAgentMessage[]
    readonly pendingDraft?: PersistedAgentDraft
  }
  readonly workspace: {
    readonly kind: 'repository' | 'scratch'
    readonly openFiles: readonly PersistedOpenFile[]
    readonly activeFilePath?: string
    readonly selectedDiffPath?: string
    readonly scratchAttached: boolean
    readonly scratchState?: Record<string, unknown>
  }
  readonly evidence: {
    readonly toolCalls: readonly MissionToolCallEvidence[]
    readonly validationRuns: readonly MissionValidationEvidence[]
    readonly webAccesses: readonly MissionWebEvidence[]
    readonly mcpCalls: readonly MissionMcpEvidence[]
    readonly subagentRuns: readonly MissionSubagentEvidence[]
    readonly skillRuns: readonly MissionSkillEvidence[]
  }
  readonly references: {
    readonly checkpointIds: readonly string[]
    readonly checkpointLinks: readonly MissionCheckpointReference[]
    readonly memoryEntryIds: readonly string[]
    readonly memoryLinks: readonly MissionMemoryReference[]
    readonly commitShas: readonly string[]
    readonly pullRequestUrls: readonly string[]
  }
  readonly labels: readonly string[]
  readonly notes?: string
  readonly importedFrom?: MissionImportedSource
}

export interface MissionEvent {
  readonly eventId: string
  readonly missionId: string
  readonly type: string
  readonly timestamp: string
  readonly summary: string
  readonly payload?: Record<string, unknown>
}

export interface MissionListSummary {
  readonly id: string
  readonly revision: number
  readonly name: string
  readonly objective: string
  readonly status: MissionStatus
  readonly updatedAt: string
  readonly lastOpenedAt: string
  readonly repositoryName?: string
  readonly repositoryRoot: string
  readonly branch?: string
  readonly validationState?: MissionValidationEvidence['status']
  readonly changedFileCount: number
  readonly pullRequestUrl?: string
  readonly labels: readonly string[]
}

export interface MissionStoreWarning {
  readonly code: 'CORRUPT_RECORD' | 'INDEX_RECOVERED' | 'STALE_TEMP_RECOVERED' | 'MISSING_REPOSITORY'
  readonly message: string
  readonly missionId?: string
  readonly path?: string
}

export interface MissionListResult {
  readonly missions: readonly MissionListSummary[]
  readonly warnings: readonly MissionStoreWarning[]
  readonly total: number
  readonly offset: number
  readonly limit: number
}

export interface MissionRepositoryReconciliation {
  readonly repositoryAvailable: boolean
  readonly recordedBranch?: string
  readonly currentBranch?: string
  readonly recordedHeadSha?: string
  readonly currentHeadSha?: string
  readonly branchExists?: boolean
  readonly hasDrift: boolean
  readonly warnings: readonly string[]
}

export interface MissionExportBundle {
  readonly kind: 'codemind.mission.bundle'
  readonly schemaVersion: 1
  readonly exportedAt: string
  readonly mission: CodeMindMission
  readonly events: readonly MissionEvent[]
  readonly warnings: readonly string[]
}
