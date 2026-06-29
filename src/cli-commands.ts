import { getCodemindFoundationSnapshot } from './codemind-foundation.js'
import {
  getCompletedRuntimeBuildPhaseCount,
  getNextRuntimeBuildPhase,
} from './runtime/runtime-build-state.js'

export const CODEMIND_CLI_COMMANDS = [
  { name: 'help', description: 'Show available command surface' },
  { name: 'status', description: 'Report CodeMind mode, policy, and runtime build state' },
  {
    name: 'operator [mission]',
    description: 'Open the CodeMind Operator Workspace console',
  },
  {
    name: 'agent [--mode <mode>] [message]',
    description:
      'Run the direct execution coding agent. Modes: APPROVED_EXECUTION, PROPOSAL_ONLY, READ_ONLY, PLAN_ONLY',
  },
  { name: 'sessions', description: 'List saved agent sessions' },
  {
    name: 'index [dir]',
    description: 'Index repository files into the vector store for semantic search',
  },
  { name: 'plan <goal>', description: 'Render a runtime-backed non-mutating work plan' },
  { name: 'scan [dir]', description: 'Summarize repository structure (defaults to cwd)' },
  { name: 'read <path>', description: 'Read an allowed workspace file without mutation' },
  { name: 'search <query>', description: 'Search allowed workspace files without mutation' },
  { name: 'propose-patch <goal>', description: 'Draft a patch proposal without applying it' },
  {
    name: 'validation-plan [focus]',
    description: 'Render validation guidance without executing commands',
  },
  { name: 'ci-review [source]', description: 'Draft a local CI review without querying services' },
  {
    name: 'ci-review --fixture-file <json-file>',
    description: 'Draft CI review from local workflow fixture evidence',
  },
  { name: 'pr-notes [focus]', description: 'Draft PR notes without posting them' },
  {
    name: 'runtime run <goal> --read-only [--max-iterations <n>] [--json]',
    description: 'Run the legacy bounded read-only runtime loop with JSON output',
  },
  {
    name: 'runtime run <goal> --approval-ticket <id>',
    description: 'Render legacy approved runtime dry-run output',
  },
  {
    name: 'live-read-policy <json-file>',
    description: 'Evaluate live read policy handshake from a local JSON fixture',
  },
  {
    name: 'live-read-client-fixture <json-file>',
    description: 'Run live read client fixture through fake client and evidence pipeline',
  },
  {
    name: 'github-live-read <json-file>',
    description: 'Read GitHub PR or CI evidence through the runtime policy live read adapter',
  },
  {
    name: 'ajna-live-read <json-file>',
    description: 'Run Ajna review or merge-readiness pipeline from live-read evidence',
  },
  {
    name: 'operator-review <json-file>',
    description: 'Create an operator review packet from a local JSON fixture',
  },
  {
    name: 'write-intent <json-file>',
    description: 'Create a write intent plan with validation evidence from a local JSON fixture',
  },
  {
    name: 'local-write <json-file>',
    description:
      'Execute a local file write through the runtime policy gate from a local JSON fixture',
  },
  {
    name: 'apply-patch <json-file>',
    description:
      'Apply a structured patch through the runtime policy patch pipeline from a local JSON fixture',
  },
  {
    name: 'repair-loop <json-file>',
    description:
      'Run a full repair loop from Ajna finding through merge readiness from a local JSON fixture',
  },
  {
    name: 'validation-command <json-file>',
    description:
      'Evaluate a validation command through the allowlisted runtime policy gate from a local JSON fixture',
  },
  {
    name: 'pr-preparation <json-file>',
    description:
      'Prepare a PR title, body, and validation checklist from a local JSON fixture without pushing or creating a PR',
  },
  {
    name: 'github-write-proposal <json-file>',
    description:
      'Create a GitHub write proposal from a local JSON fixture without executing any GitHub API call',
  },
  {
    name: 'github-write-executor <json-file>',
    description:
      'Execute a GitHub write action through the runtime policy executor from a local JSON fixture',
  },
  {
    name: 'github-write-gate <json-file>',
    description:
      'Evaluate a GitHub write through the runtime policy gate from a local JSON fixture',
  },
  {
    name: 'workflow <json-file>',
    description: 'Run a runtime workflow composing registered tools from a local JSON fixture',
  },
  {
    name: 'ajna-workflow <json-file>',
    description:
      'Run a read-only Ajna review or merge-readiness workflow from a local JSON fixture',
  },
  {
    name: 'mission-packet <json-file>',
    description:
      'Build a governed agent kernel mission packet from pipeline outputs in a local JSON fixture',
  },
  {
    name: 'audit-ledger <json-file>',
    description:
      'Persist or replay audit ledger entries from a local JSON fixture with automatic secret redaction',
  },
  {
    name: 'trace-store <json-file>',
    description:
      'Persist or replay agent kernel trace frames from a local JSON fixture with lineage and invariant validation',
  },
  {
    name: 'build-ledger',
    description:
      'Show the build ledger summary with phase details and consistency check against docs',
  },
  {
    name: 'doctor',
    description: 'Run health checks on the CodeMind workspace and report diagnostics',
  },
  {
    name: 'version',
    description: 'Show CodeMind version, platform identity, and runtime phase count',
  },
  {
    name: 'release-readiness',
    description:
      'Assess release readiness by validating all gates (phases, health, exports, config)',
  },
  {
    name: 'runtime-status',
    description: 'Show the runtime status dashboard with tool inventory, policy, and phase summary',
  },
  {
    name: 'project-context [dir]',
    description:
      'Build a deterministic project context packet from repository instructions, build state, and configuration',
  },
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
] as const

export function renderHelp(): string {
  const lines = ['CodeMind CLI', '', 'Commands:']
  for (const command of CODEMIND_CLI_COMMANDS) {
    lines.push(`  ${command.name.padEnd(54)} ${command.description}`)
  }
  return lines.join('\n')
}

export function renderStatus(): string {
  const snapshot = getCodemindFoundationSnapshot()
  const completed = getCompletedRuntimeBuildPhaseCount()
  const next = getNextRuntimeBuildPhase()
  return [
    'CodeMind Status',
    '',
    `Mode: ${snapshot.mode}`,
    `Policy: ${snapshot.policy}`,
    `Runtime phases complete: ${completed}`,
    `Next runtime phase: ${next?.title ?? 'none'}`,
    '',
    'Active capabilities:',
    ...snapshot.capabilities.map((capability) => `- ${capability}`),
  ].join('\n')
}

export function renderNotYetActive(command: string): string {
  return [
    `Command not yet active: ${command}`,
    '',
    'This command is reserved in the public CLI surface and will be activated in a later build phase.',
  ].join('\n')
}
