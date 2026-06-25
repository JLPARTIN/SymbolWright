export type RuntimeBuildPhaseState = 'COMPLETE' | 'NEXT'

export interface RuntimeBuildPhase {
  readonly id: string
  readonly title: string
  readonly state: RuntimeBuildPhaseState
  readonly activeCommands: readonly string[]
  readonly boundary: readonly string[]
}

export const RUNTIME_BUILD_PHASES: readonly RuntimeBuildPhase[] = [
  {
    id: 'A',
    title: 'Read-only runtime activation',
    state: 'COMPLETE',
    activeCommands: [
      'codemind plan <goal>',
      'codemind read <path>',
      'codemind search <query>',
      'codemind validation-plan [focus]',
    ],
    boundary: ['no writes', 'no shell execution', 'no network', 'no provider calls'],
  },
  {
    id: 'B',
    title: 'Proposal mode and operator notes',
    state: 'COMPLETE',
    activeCommands: [
      'codemind propose-patch <goal>',
      'codemind pr-notes [focus]',
      'codemind ci-review [source]',
    ],
    boundary: ['proposal-only', 'no file modification', 'no live comments'],
  },
  {
    id: 'C',
    title: 'Bounded read-only runtime loop',
    state: 'COMPLETE',
    activeCommands: ['codemind runtime run <goal> --read-only'],
    boundary: ['iteration caps enforced', 'transcript captured', 'read-only/proposal tools only'],
  },
  {
    id: 'D',
    title: 'Approval gates and audit trail',
    state: 'COMPLETE',
    activeCommands: ['codemind runtime run <goal> --approval-ticket <id>'],
    boundary: ['approval ticket required', 'protected paths blocked', 'dry-run representation only'],
  },
  {
    id: 'E',
    title: 'Local PR and workflow read adapters',
    state: 'COMPLETE',
    activeCommands: [
      'codemind pr-notes --fixture-file <json-file>',
      'codemind ci-review --fixture-file <json-file>',
    ],
    boundary: ['local fixture evidence only', 'no live service mutation', 'no workflow reruns'],
  },
  {
    id: 'F',
    title: 'Live read adapter policy handshake',
    state: 'COMPLETE',
    activeCommands: ['codemind live-read-policy <json-file>'],
    boundary: ['dry-run policy handshake only', 'no live service call', 'no writes', 'no comments', 'no merges'],
  },
  {
    id: 'G',
    title: 'Live read adapter client seam',
    state: 'NEXT',
    activeCommands: [],
    boundary: ['fake client only', 'no live service call', 'no writes', 'no comments', 'no merges'],
  },
] as const

export function getCompletedRuntimeBuildPhaseCount(): number {
  return RUNTIME_BUILD_PHASES.filter((phase) => phase.state === 'COMPLETE').length
}

export function getNextRuntimeBuildPhase(): RuntimeBuildPhase | undefined {
  return RUNTIME_BUILD_PHASES.find((phase) => phase.state === 'NEXT')
}

export function renderRuntimeBuildState(): string {
  const nextPhase = getNextRuntimeBuildPhase()
  const lines = [
    'CodeMind runtime build state',
    '',
    `Completed phases: ${getCompletedRuntimeBuildPhaseCount()}`,
    nextPhase === undefined ? 'Next phase: none' : `Next phase: Phase ${nextPhase.id} — ${nextPhase.title}`,
    '',
    'Phases:',
    ...RUNTIME_BUILD_PHASES.flatMap((phase) => [
      `- Phase ${phase.id}: ${phase.title} [${phase.state}]`,
      ...phase.activeCommands.map((command) => `  command: ${command}`),
      ...phase.boundary.map((item) => `  boundary: ${item}`),
    ]),
  ]

  return lines.join('\n')
}
