import { getCodemindFoundationSnapshot } from './codemind-foundation.js'

export const CODEMIND_CLI_COMMANDS = [
  { name: 'help', description: 'Show available command surface' },
  { name: 'status', description: 'Report CodeMind mode and policy status' },
  { name: 'plan <goal>', description: 'Produce a repository work plan [future]' },
  { name: 'scan [dir]', description: 'Summarize repository structure (defaults to cwd)' },
  { name: 'read <path>', description: 'Read approved file content [future]' },
  { name: 'search <query>', description: 'Search repository text [future]' },
  { name: 'propose-patch <goal>', description: 'Draft a patch plan without applying it [future]' },
  { name: 'validation-plan', description: 'Propose validation commands [future]' },
  { name: 'ci-review', description: 'Diagnose CI failures from available logs/context [future]' },
  { name: 'pr-notes', description: 'Draft PR summary or review notes [future]' },
  {
    name: 'ajna scan-profile [dir]',
    description: 'Render a read-only Ajna scan profile from repository scan facts',
  },
  { name: 'ajna review-pr <pr>', description: 'Produce an Ajna PR review report [future]' },
  {
    name: 'ajna merge-readiness <pr>',
    description: 'Assess merge-readiness from evidence [future]',
  },
] as const

export function renderHelp(): string {
  const lines = [
    'CodeMind — AI coding-agent platform',
    '',
    'Usage: codemind <command> [args]',
    '',
    'Commands:',
    ...CODEMIND_CLI_COMMANDS.map(({ name, description }) => `  ${name.padEnd(32)} ${description}`),
    '',
    'Run "codemind status" to see platform posture and active policy.',
  ]
  return lines.join('\n')
}

export function renderStatus(): string {
  const snap = getCodemindFoundationSnapshot()
  const lines = [
    `Platform:           ${snap.platform}`,
    `Capability:         ${snap.primaryCapability}`,
    `Posture:            ${snap.posture.join(', ')}`,
    `Mutation:           ${snap.mutationEnabled ? 'ENABLED' : 'DISABLED'}`,
    `GitHub write:       ${snap.githubWriteEnabled ? 'ENABLED' : 'DISABLED'}`,
    `Bash execution:     ${snap.bashExecutionEnabled ? 'ENABLED' : 'DISABLED'}`,
    `Network ingestion:  ${snap.networkIngestionEnabled ? 'ENABLED' : 'DISABLED'}`,
  ]
  return lines.join('\n')
}

export function renderNotYetActive(command: string): string {
  return [
    `codemind ${command}: not yet active — awaiting runtime phase`,
    'Run "codemind help" for available commands.',
  ].join('\n')
}
