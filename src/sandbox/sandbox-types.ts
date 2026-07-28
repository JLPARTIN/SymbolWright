export const SANDBOX_TRUST_CLASSES = [
  'browser-isolated',
  'container-isolated',
  'wasm-isolated',
  'guarded-host',
  'unavailable',
] as const

export type SandboxTrustClass = (typeof SANDBOX_TRUST_CLASSES)[number]

export const SANDBOX_BACKEND_KINDS = [
  'browser',
  'container',
  'wasm',
  'guarded-host',
  'unavailable',
] as const

export type SandboxBackendKind = (typeof SANDBOX_BACKEND_KINDS)[number]

export type SandboxRuntimeAvailabilityStatus = 'available' | 'unavailable' | 'misconfigured'
export type SandboxExecutionMode = 'run' | 'compile' | 'test'
/** Legacy runner-level state. The authoritative broker uses the richer network-mode evidence below. */
export type SandboxNetworkPolicy = 'disabled' | 'loopback-only' | 'allowlisted'
export type SandboxDependencyState = 'ready' | 'missing' | 'blocked' | 'unsupported'

export type SandboxExecutionStatus =
  | 'passed'
  | 'failed'
  | 'compile-error'
  | 'runtime-error'
  | 'timeout'
  | 'cancelled'
  | 'resource-limit'
  | 'policy-blocked'
  | 'unavailable'
  | 'internal-error'

export type VerificationLevel = 'UNVERIFIED' | 'COMPILED' | 'EXECUTED' | 'TESTED' | 'VALIDATED'

export interface SandboxLimits {
  readonly timeoutMs: number
  readonly compileTimeoutMs: number
  readonly maxMemoryMb: number
  readonly maxCpuPercent?: number
  readonly maxProcesses: number
  readonly maxOutputBytes: number
  readonly maxArtifactBytes: number
  readonly maxFiles: number
  readonly maxFileBytes: number
  readonly maxTotalSourceBytes: number
  readonly maxStdinBytes: number
  readonly maxArgs: number
  readonly maxArgBytes: number
}

export interface SandboxRunnerAvailability {
  readonly status: SandboxRuntimeAvailabilityStatus
  readonly version?: string
  readonly reason?: string
  readonly checkedAt: string
}

export interface SandboxRunnerCapabilities {
  readonly run: boolean
  readonly compile: boolean
  readonly test: boolean
  readonly stdin: boolean
  readonly multiFile: boolean
  readonly repository: boolean
  readonly network: boolean
}

export interface SandboxImageDefinition {
  readonly id: string
  readonly image: string
  readonly digest?: string
  readonly languages: readonly string[]
  readonly source: string
  readonly enabled: boolean
  readonly installed?: boolean
  readonly sizeBytes?: number
}

export interface SandboxRunnerDefinition {
  readonly id: string
  readonly languageIds: readonly string[]
  readonly displayName: string
  readonly trustClass: SandboxTrustClass
  readonly backend: SandboxBackendKind
  readonly availability: SandboxRunnerAvailability
  readonly capabilities: SandboxRunnerCapabilities
  readonly limits: SandboxLimits
  readonly networkPolicy: SandboxNetworkPolicy
  readonly dependencyState: SandboxDependencyState
  readonly notes: readonly string[]
}

export interface SandboxSourceFile {
  readonly path: string
  readonly content: string
}

export interface SandboxRepositoryTarget {
  readonly rootPath: string
  readonly selectedPaths?: readonly string[]
}

export interface SandboxExecutionRequest {
  readonly languageId: string
  readonly mode: SandboxExecutionMode
  readonly source?: string
  readonly files?: readonly SandboxSourceFile[]
  readonly repository?: SandboxRepositoryTarget
  readonly stdin?: string
  readonly args?: readonly string[]
  readonly limits?: Partial<SandboxLimits>
  readonly missionId?: string
  readonly requestedRunnerId?: string
}

export interface SandboxDiagnostic {
  readonly severity: 'info' | 'warning' | 'error'
  readonly message: string
  readonly path?: string
  readonly line?: number
  readonly column?: number
}

export interface SandboxArtifactReference {
  readonly artifactId: string
  readonly name: string
  readonly mimeType: string
  readonly sizeBytes: number
  readonly sha256: string
}

export interface SandboxAuthorizationEvidence {
  readonly deploymentMode: 'local' | 'hosted'
  readonly callerKind: 'operator' | 'delegated-grant' | 'team-member' | 'system'
  readonly capabilityId: string
  readonly grantIdHash?: string
  readonly principalIdHash?: string
  readonly approvalIdHash?: string
}

export interface SandboxPolicyEvidence {
  readonly id: string
  readonly version: number
  readonly fingerprint: string
  readonly intent: 'offline-execution' | 'dependency-acquisition' | 'egress-execution'
  readonly networkMode: 'disabled' | 'dependency-broker-only' | 'allowlisted-egress' | 'unsupported'
  readonly dependencyMode: 'disabled' | 'brokered' | 'unsupported'
  readonly workspaceMode: 'managed-mission' | 'temporary-copy' | 'trusted-local-host'
  readonly sourceVersions: Readonly<Record<string, number>>
}

export interface SandboxExecutionEvidence {
  /** Added by the authoritative broker finalization boundary before persistence/API return. */
  readonly schemaVersion?: 1
  readonly verificationLevel: VerificationLevel
  readonly inputHash: string
  readonly outputHash?: string
  readonly outputExcerpt?: string
  readonly policyDecision: 'allowed' | 'blocked'
  readonly policyReason?: string
  readonly decisionCode?: string
  readonly authorization?: SandboxAuthorizationEvidence
  readonly policy?: SandboxPolicyEvidence
}

export interface SandboxExecutionResult {
  readonly executionId: string
  readonly languageId: string
  readonly runnerId: string
  readonly trustClass: SandboxTrustClass
  readonly backend: SandboxBackendKind
  readonly status: SandboxExecutionStatus
  readonly startedAt: string
  readonly completedAt: string
  readonly durationMs: number
  readonly exitCode?: number
  readonly signal?: string
  readonly stdout: string
  readonly stderr: string
  readonly outputTruncated: boolean
  readonly diagnostics: readonly SandboxDiagnostic[]
  readonly artifacts: readonly SandboxArtifactReference[]
  readonly evidence: SandboxExecutionEvidence
  readonly cleanup: {
    readonly attempted: boolean
    readonly succeeded: boolean
    readonly warning?: string
  }
}

export interface SandboxInventory {
  readonly schemaVersion: 1
  readonly generatedAt: string
  readonly runners: readonly SandboxRunnerDefinition[]
  readonly images: readonly SandboxImageDefinition[]
  readonly warnings: readonly string[]
}
