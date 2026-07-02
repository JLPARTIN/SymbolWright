import { createProvider } from './cli-agent.js'
import { resolveCodemindConfig, validateCodemindConfig } from './config/codemind-config.js'
import { SubagentDispatcher } from './hivemind/subagent-dispatcher.js'
import { renderSubagentEvidence } from './runtime/tools/subagent-run-tool.js'
import {
  createRuntimePolicyForMode,
  DEFAULT_CODEMIND_RUNTIME_MODE,
  normalizeCodemindRuntimeMode,
} from './runtime/policy/runtime-policy.js'
import type { CodemindRuntimeMode, RuntimeToolContext } from './runtime/types.js'
import { discoverSkills, requireSkillByName } from './skills/skill-discovery.js'
import { renderSkillDetails, renderSkillListing } from './skills/skill-renderer.js'
import { renderSkillRunResult, runSkill } from './skills/skill-runtime.js'
import type { SkillRunInput } from './skills/skill-types.js'
import type { SubagentName } from './hivemind/subagent-definitions.js'

interface ParsedSkillRunFlags {
  readonly positionals: readonly string[]
  readonly enableGovernedTools: boolean
  readonly json: boolean
  readonly mode: CodemindRuntimeMode
  readonly dynamicContext: boolean
}

function parseSkillRunFlags(args: readonly string[]): ParsedSkillRunFlags {
  const positionals: string[] = []
  let enableGovernedTools = false
  let json = false
  let mode = DEFAULT_CODEMIND_RUNTIME_MODE
  let dynamicContext = true

  for (let index = 0; index < args.length; index++) {
    const arg = args[index]
    if (arg === undefined) continue

    if (arg === '--enable-governed') {
      enableGovernedTools = true
      continue
    }

    if (arg === '--json') {
      json = true
      continue
    }

    if (arg === '--no-dynamic-context') {
      dynamicContext = false
      continue
    }

    if (arg === '--mode') {
      const value = normalizeCodemindRuntimeMode(args[++index])
      if (value === undefined) {
        throw new Error(
          '--mode must be one of PLAN_ONLY, READ_ONLY, PROPOSAL_ONLY, APPROVED_EXECUTION',
        )
      }
      mode = value
      continue
    }

    positionals.push(arg)
  }

  return { positionals, enableGovernedTools, json, mode, dynamicContext }
}

export function renderSkillListCommand(cwd: string = process.cwd()): string {
  return renderSkillListing(discoverSkills(cwd))
}

export function renderSkillShowCommand(args: readonly string[], cwd: string = process.cwd()): string {
  const skillName = args[0]
  if (skillName === undefined) {
    throw new Error('Usage: codemind skill show <name>')
  }
  return renderSkillDetails(requireSkillByName(skillName, cwd))
}

export async function runSkillRunCommand(
  args: readonly string[],
  cwd: string = process.cwd(),
): Promise<string> {
  const flags = parseSkillRunFlags(args)
  const skillName = flags.positionals[0]
  const rawArguments = flags.positionals.slice(1).join(' ').trim()

  if (skillName === undefined) {
    throw new Error('Usage: codemind skill run <name> [arguments] [--enable-governed] [--json]')
  }

  const policy = createRuntimePolicyForMode(flags.mode)
  const context: RuntimeToolContext = { cwd, policy, sessionId: `cm-skill-cli-${Date.now()}` }
  const request: SkillRunInput = {
    name: skillName,
    arguments: rawArguments,
    enableGovernedTools: flags.enableGovernedTools,
    dynamicContext: flags.dynamicContext,
  }

  const result = await runSkill({
    cwd,
    request,
    context,
    forkRunner: async (forkRequest) => {
      const config = resolveCodemindConfig({})
      const validation = validateCodemindConfig(config)
      if (!validation.valid) {
        throw new Error(`Invalid CodeMind config: ${validation.errors.join('; ')}`)
      }
      const provider = createProvider(config)
      const dispatcher = new SubagentDispatcher(provider, context, context.sessionId ?? `cm-skill-cli`)
      const evidence = await dispatcher.dispatch({
        subagent: forkRequest.agent as SubagentName,
        goal: forkRequest.goal,
        enableGovernedTools: forkRequest.enableGovernedTools,
      })
      return renderSubagentEvidence(evidence)
    },
  })

  if (flags.json) {
    return JSON.stringify(result, null, 2)
  }

  return renderSkillRunResult(result)
}
