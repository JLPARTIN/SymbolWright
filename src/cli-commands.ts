import { getCodemindFoundationSnapshot } from './codemind-foundation.js'

export const CODEMIND_CLI_COMMANDS = [
  { name: 'help', description: 'Show available command surface' },
  { name: 'status', description: 'Report CodeMind mode and policy status' },
  { name: 'plan <goal>', description: 'Render a runtime-backed non-mutating work plan' },
  { name: 'scan [dir]', description: 'Summarize repository structure (defaults to cwd)' },
  { name: 'read <path>', description: 'Read an allowed workspace file without mutation' },
  { name: 'search <query>', description: 'Search allowed workspace files without mutation' },
  { name: 'propose-patch <goal>', description: 'Draft a patch proposal without applying it' },
  { name: 'validation-plan [focus]', description: 'Render validation guidance without executing commands' },
  { name: 'ci-review [source]', description: 'Draft a local CI review without querying services' },
  { name: 'pr-notes [focus]', description: 'Draft PR notes without posting them' },
  { name: 'runtime run <goal> --read-only', description: 'Run a bounded read-only runtime loop' },
  { name: 'runtime run <goal> --approval-ticket <id>', description: 'Render approval-gated dry-run execution with audit output' },
  {
    name: 'ajna scan-profile [dir]',
    description: 'Render a read-only Ajna scan profile from repository scan facts',
  },
  {
    name: 'ajna docs',
    description: 'Render the local Ajna documentation reference',
  },
  {
    name: 'ajna client-pipeline-manifest',
    description: 'Render the local Ajna client collector fixture pipeline manifest',
  },
  {
    name: 'ajna client-pipeline-status',
    description: 'Render the local Ajna client collector fixture pipeline status',
  },
  {
    name: 'ajna review-pr <json-file>',
    description: 'Render a read-only Ajna PR review report from evidence JSON',
  },
  {
    name: 'ajna review-pr-github-fixture <json-file>',
    description: 'Render Ajna review-pr from a mocked local GitHub PR payload fixture',
  },
  {
    name: 'ajna review-pr-github-api-fixture <json-file>',
    description: 'Render Ajna review-pr from a local GitHub-shaped API payload fixture',
  },
  {
    name: 'ajna github-api-snapshot-fixture <json-file>',
    description: 'Render collector snapshot JSON from a local GitHub-shaped API payload fixture',
  },
  {
    name: 'ajna client-collector-fixture <json-file>',
    description: 'Render collector snapshot JSON from a local fake client bridge fixture',
  },
  {
    name: 'ajna review-pr-client-collector-fixture <json-file>',
    description: 'Render Ajna review-pr from a local fake client bridge fixture',
  },
  {
    name: 'ajna merge-readiness-client-collector-fixture <json-file>',
    description: 'Assess merge-readiness from a local fake client bridge fixture',
  },
  {
    name: 'ajna review-pr-collector-fixture <json-file>',
    description: 'Render Ajna review-pr from a local collector snapshot fixture',
  },
  {
    name: 'ajna review-pr-readonly-collector-fixture <json-file>',
    description: 'Render Ajna review-pr from a local read-only collector request fixture',
  },
  {
    name: 'ajna github-readonly-collector-fixture <json-file>',
    description: 'Render a local read-only collector snapshot fixture as JSON',
  },
  {
    name: 'ajna merge-readiness <json-file>',
    description: 'Assess merge-readiness from read-only Ajna evidence JSON',
  },
] as const

export function renderHelp(): string {
  const lines = [
    'CodeMind — AI coding-agent platform',
    '',
    'Usage: codemind <command> [args]',
    '',
    'Commands:',
    ...CODEMIND_CLI_COMMANDS.map(({ name, description }) => `  ${name.padEnd(56)} ${description}`),
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
