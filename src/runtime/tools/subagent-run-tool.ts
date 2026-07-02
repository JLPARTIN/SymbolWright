import type { RuntimeToolDefinition, RuntimeToolContext } from '../types.js'
import {
  SUBAGENT_NAMES,
  type SubagentName,
  isSubagentName,
} from '../../hivemind/subagent-definitions.js'
import type { SubagentDispatchEvidence } from '../../hivemind/subagent-dispatcher.js'
import type { SubagentDispatcher } from '../../hivemind/subagent-dispatcher.js'

export interface SubagentRunToolInput {
  readonly subagent: SubagentName
  readonly goal: string
  readonly enableGovernedTools?: boolean
}

export function parseSubagentRunInput(input: unknown): SubagentRunToolInput {
  if (typeof input !== 'object' || input === null) {
    throw new Error('Missing input: subagent_run requires subagent and goal')
  }
  const raw = input as Record<string, unknown>

  if (typeof raw['subagent'] !== 'string') {
    throw new Error(`Missing subagent. Valid names: ${SUBAGENT_NAMES.join(', ')}`)
  }

  const subagent = raw['subagent']
  if (!isSubagentName(subagent)) {
    throw new Error(`Invalid subagent "${subagent}". Valid: ${SUBAGENT_NAMES.join(', ')}`)
  }

  if (typeof raw['goal'] !== 'string' || raw['goal'].length === 0) {
    throw new Error('Missing or empty goal')
  }

  return {
    subagent,
    goal: raw['goal'],
    ...(typeof raw['enableGovernedTools'] === 'boolean'
      ? { enableGovernedTools: raw['enableGovernedTools'] }
      : {}),
  }
}

export function renderSubagentEvidence(evidence: SubagentDispatchEvidence): string {
  return [
    'CodeMind subagent run',
    '',
    `Subagent: ${evidence.subagent}`,
    `Status: ${evidence.status.toUpperCase()}`,
    `Parent session: ${evidence.parentSessionId}`,
    `Child session: ${evidence.childSessionId}`,
    `Governed tools enabled: ${evidence.governedToolsEnabled}`,
    `Tools used: ${evidence.toolsUsed.length > 0 ? evidence.toolsUsed.join(', ') : '(none)'}`,
    `Iterations: ${evidence.iterationCount}`,
    `Duration: ${evidence.durationMs}ms`,
    ...(evidence.reason !== undefined ? [`Reason: ${evidence.reason}`] : []),
    '',
    '## Findings',
    ...(evidence.result.findings.length > 0
      ? evidence.result.findings.map((f) => `- ${f}`)
      : ['(none reported)']),
    '',
    '## Evidence',
    ...(evidence.result.evidence.length > 0
      ? evidence.result.evidence.map((e) => `- ${e}`)
      : ['(none reported)']),
    '',
    '## Risks',
    ...(evidence.result.risks.length > 0
      ? evidence.result.risks.map((r) => `- ${r}`)
      : ['(none reported)']),
  ].join('\n')
}

export function createWiredSubagentRunTool(
  dispatcher: SubagentDispatcher,
  onResult?: (result: SubagentDispatchEvidence) => void,
): RuntimeToolDefinition {
  return {
    name: 'subagent_run',
    description: `Dispatch a read-only worker subagent. Names: ${SUBAGENT_NAMES.join(', ')}. Runs isolated with its own tool allowlist and child session; returns structured findings/evidence/risks.`,
    capability: 'APPROVED_COMMAND',
    execute: async (input: unknown, _context: RuntimeToolContext): Promise<string> => {
      const parsed = parseSubagentRunInput(input)

      const evidence = await dispatcher.dispatch({
        subagent: parsed.subagent,
        goal: parsed.goal,
        ...(parsed.enableGovernedTools !== undefined
          ? { enableGovernedTools: parsed.enableGovernedTools }
          : {}),
      })
      onResult?.(evidence)

      return renderSubagentEvidence(evidence)
    },
  }
}

export const subagentRunTool: RuntimeToolDefinition = {
  name: 'subagent_run',
  description: `Dispatch a read-only worker subagent. Names: ${SUBAGENT_NAMES.join(', ')}. Runs isolated with its own tool allowlist and child session; returns structured findings/evidence/risks.`,
  capability: 'APPROVED_COMMAND',
  execute: async (input: unknown, _context: RuntimeToolContext): Promise<string> => {
    const parsed = parseSubagentRunInput(input)

    return [
      'CodeMind subagent run',
      '',
      `Subagent: ${parsed.subagent}`,
      `Goal: ${parsed.goal}`,
      '',
      'Status: QUEUED',
      'Note: Subagent dispatch requires an active SubagentDispatcher instance.',
      'Use createWiredSubagentRunTool() to enable live dispatch.',
    ].join('\n')
  },
}
