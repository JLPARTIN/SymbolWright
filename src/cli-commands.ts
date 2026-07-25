import { getSymbolWrightFoundationSnapshot } from './symbolwright-foundation.js'
import {
  getCompletedRuntimeBuildPhaseCount,
  getNextRuntimeBuildPhase,
} from './runtime/runtime-build-state.js'

export const SYMBOLWRIGHT_CLI_COMMANDS = [
  { name: 'help', description: 'Show available command surface' },
  { name: 'status', description: 'Report SymbolWright mode, policy, and runtime build state' },
  {
    name: 'operator [mission]',
    description: 'Open the SymbolWright Operator Workspace console',
  },
  {
    name: 'agent [message] [--mode <mode>]',
    description:
      'Run the direct execution coding agent with APPROVED_EXECUTION, PROPOSAL_ONLY, READ_ONLY, or PLAN_ONLY runtime mode',
  },
  { name: 'sessions', description: 'List saved agent sessions' },
  {
    name: 'index [dir]',
    description: 'Index repository files into the vector store for semantic search',
  },
  { name: 'plan <goal>', description: 'Render a runtime-backed non-mutating work plan' },
  { name: 'scan [dir]', description: 'Summarize repository structure (defaults to cwd)' },
  {
    name: 'preflight [changed-file...]',
    description:
      'Run the sandboxed PR preflight evidence pipeline against changed files and report a READY/NEEDS_WORK/BLOCKED verdict',
  },
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
    name: 'pr-notes --fixture-file <json-file>',
    description: 'Draft PR notes from local PR fixture evidence',
  },
  {
    name: 'runtime run <goal> --read-only [--max-iterations <n>] [--json]',
    description: 'Run a bounded runtime loop with operator controls and JSON output',
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
    description: 'Run health checks on the SymbolWright workspace and report diagnostics',
  },
  {
    name: 'version',
    description: 'Show SymbolWright version, platform identity, and runtime phase count',
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
  {
    name: 'mcp list',
    description: 'List configured MCP servers from .symbolwright/mcp.json and probe reachability',
  },
  {
    name: 'mcp tools [server]',
    description: 'Discover tools advertised by one or all configured MCP servers',
  },
  {
    name: 'mcp call <server.tool> [json-args]',
    description: 'Invoke a tool on a configured MCP server through the policy gate',
  },
  {
    name: 'mcp-server [--mode <mode>]',
    description:
      'Run SymbolWright itself as an MCP server over stdio (default READ_ONLY) so any MCP-compatible LLM client can use it as a plugin',
  },
  {
    name: 'web fetch <url> [--json] [--allow-private] [--mode <mode>]',
    description: 'Fetch a public web page/API resource through the web policy gate',
  },
  {
    name: 'web search "<query>" [--json] [--mode <mode>]',
    description: 'Search the public web (default: DuckDuckGo) through the web policy gate',
  },
  {
    name: 'checkpoint list [--session <id>] [--json]',
    description: 'List checkpoints snapshotted before mutating writes',
  },
  {
    name: 'checkpoint show <id> [--json]',
    description: "Show a checkpoint's touched files, hashes, and restore history",
  },
  {
    name: 'checkpoint restore <id> [--json]',
    description: 'Restore every file in a checkpoint to its pre-mutation state',
  },
  {
    name: 'subagent list',
    description: 'List the read-only worker subagents (explorer, reviewer, test-planner)',
  },
  {
    name: 'subagent run <name> "<goal>" [--enable-governed] [--json] [--mode <mode>]',
    description: 'Dispatch an isolated read-only subagent; returns findings/evidence/risks',
  },
  {
    name: 'skill list',
    description: 'List bundled, project, and Claude-compatible SymbolWright Skills',
  },
  {
    name: 'skill show <name>',
    description: 'Show skill frontmatter, source, allowed tools, and invocation mode',
  },
  {
    name: 'skill run <name> [args] [--enable-governed] [--json]',
    description: 'Run a file-based SymbolWright Skill; forked skills use the subagent runtime',
  },
  {
    name: 'serve [--host <host>] [--port <port>] [--cors-origin <origin>]',
    description:
      'Start the SymbolWright Chat API + browser UI, routed through the provider gateway (requires SYMBOLWRIGHT_API_KEY)',
  },
] as const

export function renderHelp(): string {
  const lines = [
    'SymbolWright — direct execution AI coding agent',
    '',
    'Usage: symbolwright <command> [args]',
    '',
    'Commands:',
    ...SYMBOLWRIGHT_CLI_COMMANDS.map(
      ({ name, description }) => `  ${name.padEnd(56)} ${description}`,
    ),
    '',
    'Run "codemind agent --mode APPROVED_EXECUTION" for direct agent work.',
    'Run "codemind status" to see platform posture and active policy.',
  ]
  return lines.join('\n')
}

export function renderStatus(): string {
  const snap = getSymbolWrightFoundationSnapshot()
  const nextPhase = getNextRuntimeBuildPhase()
  const lines = [
    `Platform:           ${snap.platform}`,
    `Capability:         ${snap.primaryCapability}`,
    `Posture:            ${snap.posture.join(', ')}`,
    `Runtime phases:     ${getCompletedRuntimeBuildPhaseCount()} complete`,
    `Next runtime phase: ${nextPhase === undefined ? 'none' : `Phase ${nextPhase.id} — ${nextPhase.title}`}`,
    `Mutation:           ${snap.mutationEnabled ? 'ENABLED' : 'DISABLED'}`,
    `GitHub write:       ${snap.githubWriteEnabled ? 'ENABLED' : 'DISABLED'}`,
    `Bash execution:     ${snap.bashExecutionEnabled ? 'ENABLED' : 'DISABLED'}`,
    `Network ingestion:  ${snap.networkIngestionEnabled ? 'ENABLED' : 'DISABLED'}`,
  ]
  return lines.join('\n')
}

export function renderNotYetActive(command: string): string {
  return [
    `Command not active yet: ${command}`,
    '',
    'This command is reserved for a later SymbolWright runtime phase.',
    'Run "codemind status" to see the current activation surface.',
  ].join('\n')
}
