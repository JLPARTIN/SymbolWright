export type FileKind =
  | 'source'
  | 'test'
  | 'package-metadata'
  | 'lockfile'
  | 'workflow'
  | 'documentation'
  | 'config'
  | 'unknown'

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical'
export type PackageManager = 'npm' | 'pnpm' | 'yarn' | 'unknown' | 'conflict'
export type CommandStatus = 'passed' | 'failed' | 'missing' | 'skipped' | 'blocked'
export type PrReadinessVerdict = 'READY' | 'NEEDS_WORK' | 'BLOCKED' | 'RISK_ACCEPTED'
export type PushRecommendation =
  | 'SAFE_TO_PUSH'
  | 'DO_NOT_PUSH'
  | 'PUSH_ONLY_WITH_RISK_ACCEPTANCE'

export interface ChangedFileAnalysis {
  readonly originalPath: string
  readonly normalizedPath: string
  readonly kind: FileKind
  readonly riskLevel: RiskLevel
  readonly requiresFormat: boolean
  readonly requiresLint: boolean
  readonly requiresTypecheck: boolean
  readonly requiresTest: boolean
  readonly requiresBuild: boolean
  readonly forensicGates: readonly string[]
}

export interface FailureRecord {
  readonly failureClass: string
  readonly rootCause: string
  readonly preventionRule: string
  readonly regressionTest: string
  readonly firstSeen: string
  readonly status: 'active' | 'inactive'
  readonly affectedFilePatterns: readonly string[]
}

export interface FailureLedger {
  readonly schemaVersion: number
  readonly failures: readonly FailureRecord[]
}

export interface FailureLedgerLoadResult {
  readonly ok: boolean
  readonly ledger?: FailureLedger
  readonly error?: string
}

export interface MatchedFailureRule {
  readonly failureClass: string
  readonly affectedFile: string
  readonly pattern: string
  readonly preventionRule: string
  readonly regressionTest: string
}

export interface ValidationPlan {
  readonly requiredScripts: readonly string[]
  readonly forensicGates: readonly string[]
  readonly failuresPrevented: readonly string[]
}

export interface CommandResult {
  readonly script: string
  readonly command: string
  readonly packageManager: PackageManager
  readonly status: CommandStatus
  readonly exitCode: number | null
  readonly stdout: string
  readonly stderr: string
  readonly durationMs: number
  readonly reason?: string
}

export interface PreflightInput {
  readonly repoRoot: string
  readonly changedFiles: readonly string[]
}

export interface PrReadinessReport {
  readonly verdict: PrReadinessVerdict
  readonly confidence: number
  readonly changedFiles: readonly ChangedFileAnalysis[]
  readonly validationCommands: readonly CommandResult[]
  readonly forensicGates: readonly string[]
  readonly failuresPrevented: readonly string[]
  readonly remainingRisks: readonly string[]
  readonly pushRecommendation: PushRecommendation
}
