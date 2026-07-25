import {
  SUBAGENT_DEFINITIONS,
  SUBAGENT_NAMES,
  isSubagentName,
} from './hivemind/subagent-definitions.js'
import { SubagentDispatcher } from './hivemind/subagent-dispatcher.js'
import { renderSubagentEvidence } from './runtime/tools/subagent-run-tool.js'
import {
  resolveSymbolWrightConfig,
  validateSymbolWrightConfig,
} from './config/symbolwright-config.js'
import {
  createRuntimePolicyForMode,
  DEFAULT_SYMBOLWRIGHT_RUNTIME_MODE,
  normalizeSymbolWrightRuntimeMode,
} from './runtime/policy/runtime-policy.js'
import type { SymbolWrightRuntimeMode, RuntimeToolContext } from './runtime/types.js'
import { createProvider } from './cli-agent.js'

export function renderSubagentListCommand(): string {
  const lines = ['SymbolWright subagents', '']
  for (const name of SUBAGENT_NAMES) {
    const definition = SUBAGENT_DEFINITIONS[name]
    lines.push(`- ${definition.name} (${definition.mode}): ${definition.description}`)
    lines.push(`  allowed: ${definition.allowedTools.join(', ')}`)
    lines.push(`  governed (requires --enable-governed): ${definition.governedTools.join(', ')}`)
  }
  return lines.join('\n')
}

interface ParsedSubagentRunFlags {
  readonly positionals: readonly string[]
  readonly enableGovernedTools: boolean
  readonly json: boolean
  readonly mode: SymbolWrightRuntimeMode
}

function parseSubagentRunFlags(args: readonly string[]): ParsedSubagentRunFlags {
  const positionals: string[] = []
  let enableGovernedTools = false
  let json = false
  let mode = DEFAULT_SYMBOLWRIGHT_RUNTIME_MODE

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === '--enable-governed') {
      enableGovernedTools = true
      continue
    }
    if (arg === '--json') {
      json = true
      continue
    }
    if (arg === '--mode') {
      const value = normalizeSymbolWrightRuntimeMode(args[++i])
      if (value === undefined) {
        throw new Error(
          '--mode must be one of PLAN_ONLY, READ_ONLY, PROPOSAL_ONLY, APPROVED_EXECUTION',
        )
      }
      mode = value
      continue
    }
    if (arg !== undefined) {
      positionals.push(arg)
    }
  }

  return { positionals, enableGovernedTools, json, mode }
}

export async function runSubagentRunCommand(
  args: readonly string[],
  cwd: string = process.cwd(),
): Promise<string> {
  const flags = parseSubagentRunFlags(args)
  const subagentArg = flags.positionals[0]
  const goal = flags.positionals.slice(1).join(' ').trim()

  if (subagentArg === undefined || goal.length === 0) {
    throw new Error(
      `Usage: symbolwright subagent run <${SUBAGENT_NAMES.join('|')}> "<goal>" [--enable-governed] [--json]`,
    )
  }

  if (!isSubagentName(subagentArg)) {
    throw new Error(`Invalid subagent "${subagentArg}". Valid: ${SUBAGENT_NAMES.join(', ')}`)
  }

  const config = resolveSymbolWrightConfig({})
  const validation = validateSymbolWrightConfig(config)
  if (!validation.valid) {
    throw new Error(`Invalid SymbolWright config: ${validation.errors.join('; ')}`)
  }

  const provider = createProvider(config)
  const policy = createRuntimePolicyForMode(flags.mode, {
    hasGitHubToken: config.githubToken !== undefined,
  })
  const toolContext: RuntimeToolContext = { cwd, policy }

  const parentSessionId = `cm-cli-${Date.now()}`
  const dispatcher = new SubagentDispatcher(provider, toolContext, parentSessionId)

  const evidence = await dispatcher.dispatch({
    subagent: subagentArg,
    goal,
    enableGovernedTools: flags.enableGovernedTools,
  })

  if (flags.json) {
    return JSON.stringify(evidence, null, 2)
  }

  return renderSubagentEvidence(evidence)
}
