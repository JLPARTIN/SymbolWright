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
      'symbolwright plan <goal>',
      'symbolwright read <path>',
      'symbolwright search <query>',
      'symbolwright validation-plan [focus]',
    ],
    boundary: ['no writes', 'no shell execution', 'no network', 'no provider calls'],
  },
  {
    id: 'B',
    title: 'Proposal mode and operator notes',
    state: 'COMPLETE',
    activeCommands: [
      'symbolwright propose-patch <goal>',
      'symbolwright pr-notes [focus]',
      'symbolwright ci-review [source]',
    ],
    boundary: ['proposal-only', 'no file modification', 'no live comments'],
  },
  {
    id: 'C',
    title: 'Bounded read-only runtime loop',
    state: 'COMPLETE',
    activeCommands: ['symbolwright runtime run <goal> --read-only'],
    boundary: ['iteration caps enforced', 'transcript captured', 'read-only/proposal tools only'],
  },
  {
    id: 'D',
    title: 'Retired approval-ticket dry-run surface',
    state: 'COMPLETE',
    activeCommands: [],
    boundary: [
      'legacy dry-run tool surface removed',
      'workspace mutation uses sandbox-backed write tools',
      'validation commands use sandbox runner',
    ],
  },
  {
    id: 'E',
    title: 'Local PR and workflow read adapters',
    state: 'COMPLETE',
    activeCommands: [
      'symbolwright pr-notes --fixture-file <json-file>',
      'symbolwright ci-review --fixture-file <json-file>',
    ],
    boundary: ['local fixture evidence only', 'no live service mutation', 'no workflow reruns'],
  },
  {
    id: 'F',
    title: 'Live read adapter policy handshake',
    state: 'COMPLETE',
    activeCommands: ['symbolwright live-read-policy <json-file>'],
    boundary: [
      'dry-run policy handshake only',
      'no live service call',
      'no writes',
      'no comments',
      'no merges',
    ],
  },
  {
    id: 'G',
    title: 'Live read adapter client seam',
    state: 'COMPLETE',
    activeCommands: ['symbolwright live-read-client-fixture <json-file>'],
    boundary: ['fake client only', 'no live service call', 'no writes', 'no comments', 'no merges'],
  },
  {
    id: 'H',
    title: 'Live GitHub read adapter behind policy',
    state: 'COMPLETE',
    activeCommands: ['symbolwright github-live-read <json-file>'],
    boundary: [
      'policy-gated live reads',
      'read-only GitHub operations',
      'no writes',
      'no comments',
      'no merges',
    ],
  },
  {
    id: 'I',
    title: 'Ajna live-read review pipeline',
    state: 'COMPLETE',
    activeCommands: ['symbolwright ajna-live-read <json-file>'],
    boundary: ['read-only evidence only', 'no comments', 'no review submissions', 'no merges'],
  },
  {
    id: 'J',
    title: 'Operator review gate for live outputs',
    state: 'COMPLETE',
    activeCommands: ['symbolwright operator-review <json-file>'],
    boundary: ['no automatic approval', 'no writes', 'no PR comments', 'no merges'],
  },
  {
    id: 'K',
    title: 'Approved write preparation',
    state: 'COMPLETE',
    activeCommands: ['symbolwright write-intent <json-file>'],
    boundary: ['no actual writes', 'no GitHub mutation', 'protected paths blocked'],
  },
  {
    id: 'L',
    title: 'Controlled local file write gate',
    state: 'COMPLETE',
    activeCommands: ['symbolwright local-write <json-file>'],
    boundary: [
      'approval ticket required',
      'protected paths blocked',
      'workspace only',
      'no GitHub writes',
    ],
  },
  {
    id: 'M',
    title: 'Approved validation command gate',
    state: 'COMPLETE',
    activeCommands: ['symbolwright validation-command <json-file>'],
    boundary: [
      'allowlisted commands only',
      'approval ticket required',
      'no arbitrary shell',
      'no GitHub writes',
    ],
  },
  {
    id: 'N',
    title: 'PR preparation from approved local changes',
    state: 'COMPLETE',
    activeCommands: ['symbolwright pr-preparation <json-file>'],
    boundary: ['title/body/checklist only', 'no push', 'no GitHub writes'],
  },
  {
    id: 'O',
    title: 'Governed GitHub write proposal',
    state: 'COMPLETE',
    activeCommands: ['symbolwright github-write-proposal <json-file>'],
    boundary: ['proposal only', 'no execution', 'no push', 'no merge'],
  },
  {
    id: 'P',
    title: 'Approved GitHub write gate',
    state: 'COMPLETE',
    activeCommands: ['symbolwright github-write-gate <json-file>'],
    boundary: [
      'approval required',
      'create draft PR only',
      'post comment only',
      'apply label only',
      'no merge',
    ],
  },
  {
    id: 'Q',
    title: 'Runtime integration and workflow composition',
    state: 'COMPLETE',
    activeCommands: ['symbolwright workflow <json-file>'],
    boundary: [
      'governed composition only',
      'no new mutation surface',
      'existing tool gates enforced',
    ],
  },
  {
    id: 'R',
    title: 'Read-only Ajna workflow surface',
    state: 'COMPLETE',
    activeCommands: ['symbolwright ajna-workflow <json-file>'],
    boundary: ['read-only Ajna pipelines only', 'no new mutation surface'],
  },
  {
    id: 'S',
    title: 'Runtime status dashboard',
    state: 'COMPLETE',
    activeCommands: ['symbolwright runtime-status'],
    boundary: ['read-only status only', 'no new mutation surface'],
  },
  {
    id: 'T',
    title: 'Approved local file write execution',
    state: 'COMPLETE',
    activeCommands: ['symbolwright local-write <json-file>'],
    boundary: [
      'approval ticket required',
      'file:write scope required',
      'protected paths blocked',
      'workspace only',
      'dry-run by default',
      'no GitHub writes',
      'no shell execution',
    ],
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
    'SymbolWright runtime build state',
    '',
    `Completed phases: ${getCompletedRuntimeBuildPhaseCount()}`,
    nextPhase === undefined
      ? 'Next phase: none'
      : `Next phase: Phase ${nextPhase.id} — ${nextPhase.title}`,
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
