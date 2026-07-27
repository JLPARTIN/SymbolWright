export const OPERATOR_COMMAND_NAMES = [
  'help',
  'status',
  'doctor',
  'runtime-status',
  'scan',
  'plan',
  'run',
  'read',
  'search',
  'validation-plan',
  'propose',
  'pr-notes',
  'zflow',
  'workspace',
  'history',
  'session',
  'clear',
  'exit',
] as const

export type OperatorCommandName = (typeof OPERATOR_COMMAND_NAMES)[number]

export type OperatorInputKind = 'empty' | 'invalid' | 'mission' | 'slash'

export interface OperatorEmptyInput {
  readonly kind: 'empty'
  readonly raw: string
}

export interface OperatorInvalidInput {
  readonly kind: 'invalid'
  readonly raw: string
  readonly error: string
}

export interface OperatorMissionInput {
  readonly kind: 'mission'
  readonly raw: string
  readonly goal: string
}

export interface OperatorSlashInput {
  readonly kind: 'slash'
  readonly raw: string
  readonly command: OperatorCommandName
  readonly args: readonly string[]
}

export type ParsedOperatorInput =
  OperatorEmptyInput | OperatorInvalidInput | OperatorMissionInput | OperatorSlashInput

export interface OperatorHistoryEntry {
  readonly timestamp: string
  readonly input: string
  readonly kind: Exclude<OperatorInputKind, 'empty'>
}

export interface OperatorSessionState {
  readonly sessionId: string
  readonly cwd: string
  readonly startedAt: string
  readonly history: readonly OperatorHistoryEntry[]
  readonly lastMission?: string
  readonly workspaceRepos?: readonly string[]
}

export interface OperatorCommandResult {
  readonly exit: boolean
  readonly output: string
  readonly session: OperatorSessionState
}

export interface OperatorConsoleHandlers {
  readonly renderStatus: () => string
  readonly renderDoctor: (cwd: string) => string
  readonly renderRuntimeStatus: () => string
  readonly renderScan: (dir: string) => string
  readonly renderPlan: (goal: string, cwd: string) => Promise<string>
  readonly renderRun: (goal: string, cwd: string) => Promise<string>
  readonly renderRead: (path: string, cwd: string) => Promise<string>
  readonly renderSearch: (query: string, cwd: string) => Promise<string>
  readonly renderValidationPlan: (focus: string | undefined, cwd: string) => Promise<string>
  readonly renderProposePatch: (goal: string, cwd: string) => Promise<string>
  readonly renderPrNotes: (focus: string | undefined, cwd: string) => Promise<string>
  readonly renderZflowReport: (fixturePath: string, cwd: string) => Promise<string>
  readonly renderWorkspace: (cwd: string) => string
}
