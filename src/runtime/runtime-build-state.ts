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
    state: 'COMPLETE',
    activeCommands: ['codemind live-read-client-fixture <json-file>'],
    boundary: ['fake client only', 'no live service call', 'no writes', 'no comments', 'no merges'],
  },
  {
    id: 'H',
    title: 'Live GitHub read adapter behind policy',
    state: 'COMPLETE',
    activeCommands: ['codemind github-live-read <json-file>'],
    boundary: ['policy-gated live reads', 'read-only GitHub operations', 'no writes', 'no comments', 'no merges'],
  },
  {
    id: 'I',
    title: 'Ajna live-read review pipeline',
    state: 'COMPLETE',
    activeCommands: ['codemind ajna-live-read <json-file>'],
    boundary: ['read-only evidence only', 'no comments', 'no review submissions', 'no merges'],
  },
  {
    id: 'J',
    title: 'Operator review gate for live outputs',
    state: 'COMPLETE',
    activeCommands: ['codemind operator-review <json-file>'],
    boundary: ['no automatic approval', 'no writes', 'no PR comments', 'no merges'],
  },
  {
    id: 'K',
    title: 'Approved write preparation',
    state: 'COMPLETE',
    activeCommands: ['codemind write-intent <json-file>'],
    boundary: ['no actual writes', 'no GitHub mutation', 'protected paths blocked'],
  },
  {
    id: 'L',
    title: 'Controlled local file write gate',
    state: 'COMPLETE',
    activeCommands: ['codemind local-write <json-file>'],
    boundary: ['approval ticket required', 'protected paths blocked', 'workspace only', 'no GitHub writes'],
  },
  {
    id: 'M',
    title: 'Approved validation command gate',
    state: 'COMPLETE',
    activeCommands: ['codemind validation-command <json-file>'],
    boundary: ['allowlisted commands only', 'approval ticket required', 'no arbitrary shell', 'no GitHub writes'],
  },
  {
    id: 'N',
    title: 'PR preparation from approved local changes',
    state: 'COMPLETE',
    activeCommands: ['codemind pr-preparation <json-file>'],
    boundary: ['title/body/checklist only', 'no push', 'no GitHub writes'],
  },
  {
    id: 'O',
    title: 'Governed GitHub write proposal',
    state: 'COMPLETE',
    activeCommands: ['codemind github-write-proposal <json-file>'],
    boundary: ['proposal only', 'no execution', 'no push', 'no merge'],
  },
  {
    id: 'P',
    title: 'Approved GitHub write gate',
    state: 'NEXT',
    activeCommands: [],
    boundary: ['approval required', 'create draft PR only', 'post comment only', 'apply label only', 'no merge'],
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
