import type { CodemindToolName } from '../runtime/types.js'

/** The three real read-only workers this bundle ships. Nothing else — no HiveMind-scale swarm. */
export const SUBAGENT_NAMES = ['explorer', 'reviewer', 'test-planner'] as const
export type SubagentName = (typeof SUBAGENT_NAMES)[number]

export function isSubagentName(value: string): value is SubagentName {
  return (SUBAGENT_NAMES as readonly string[]).includes(value)
}

export interface SubagentDefinition {
  readonly name: SubagentName
  readonly mode: 'readonly'
  readonly description: string
  /** Available immediately — filtered from the real tool registry, not just policy-blocked. */
  readonly allowedTools: readonly CodemindToolName[]
  /** Withheld unless a caller explicitly turns governance on for this dispatch. */
  readonly governedTools: readonly CodemindToolName[]
  readonly systemPromptSuffix: string
}

// Read-only info tools every worker gets. "repo_map" isn't a distinct tool in this
// codebase — glob/search_files already cover read-only repo-structure mapping, so
// nothing fake was invented to fill that name.
const READ_ONLY_CORE_TOOLS: readonly CodemindToolName[] = [
  'read_file',
  'list_files',
  'search_files',
  'glob',
  'grep',
  'memory_recall',
]

// Withheld from all three workers by default: real mutation, shell execution,
// GitHub writes, and nested subagent/swarm spawning. Turning governance on for a
// dispatch grants exactly this list — nothing broader.
const GOVERNED_MUTATION_TOOLS: readonly CodemindToolName[] = [
  'edit_file',
  'local_file_write',
  'apply_patch',
  'bash',
  'git',
  'github_create_pr',
  'github_write_proposal',
  'github_write_gate',
  'swarm_dispatch',
  'subagent_run',
]

const STRUCTURED_OUTPUT_INSTRUCTIONS = [
  'Structure your final answer under these three headers exactly, so the parent',
  'session can parse it:',
  '## Findings',
  '- one finding per line',
  '## Evidence',
  '- file paths, line ranges, or quotes backing each finding',
  '## Risks',
  '- anything the parent should be cautious about before acting',
].join('\n')

export const SUBAGENT_DEFINITIONS: Readonly<Record<SubagentName, SubagentDefinition>> = {
  explorer: {
    name: 'explorer',
    mode: 'readonly',
    description:
      'Explores the codebase read-only: locates relevant files, maps structure, gathers context.',
    allowedTools: [...READ_ONLY_CORE_TOOLS, 'web_fetch', 'web_search'],
    governedTools: GOVERNED_MUTATION_TOOLS,
    systemPromptSuffix: [
      'You are the Explorer subagent. Read-only access: locate relevant files, map repo structure,',
      'and gather context for the parent session. Do not propose or make edits.',
      '',
      STRUCTURED_OUTPUT_INSTRUCTIONS,
    ].join('\n'),
  },
  reviewer: {
    name: 'reviewer',
    mode: 'readonly',
    description: 'Reviews code/changes read-only: assesses quality, risk, and merge readiness.',
    allowedTools: [...READ_ONLY_CORE_TOOLS, 'preflight'],
    governedTools: GOVERNED_MUTATION_TOOLS,
    systemPromptSuffix: [
      'You are the Reviewer subagent. Read-only access: inspect changed files, assess correctness,',
      'risk, and merge readiness. Never apply a fix yourself — report back to the parent.',
      '',
      STRUCTURED_OUTPUT_INSTRUCTIONS,
    ].join('\n'),
  },
  'test-planner': {
    name: 'test-planner',
    mode: 'readonly',
    description: 'Plans validation/test coverage read-only, without executing or writing tests.',
    allowedTools: [...READ_ONLY_CORE_TOOLS, 'validation_plan'],
    governedTools: [...GOVERNED_MUTATION_TOOLS, 'run_tests', 'run_typecheck', 'run_lint'],
    systemPromptSuffix: [
      'You are the Test-Planner subagent. Read-only access: identify what needs test coverage and',
      'propose a validation plan. Do not write or execute tests yourself unless governance for',
      'run_tests/run_typecheck/run_lint has been explicitly enabled for this dispatch.',
      '',
      STRUCTURED_OUTPUT_INSTRUCTIONS,
    ].join('\n'),
  },
}

export function getSubagentDefinition(name: string): SubagentDefinition | undefined {
  return isSubagentName(name) ? SUBAGENT_DEFINITIONS[name] : undefined
}
