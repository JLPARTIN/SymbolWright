import { renderSubagentEvidence } from './subagent-run-tool.js'
import type { RuntimeToolContext, RuntimeToolDefinition } from '../types.js'
import type { SubagentName } from '../../hivemind/subagent-definitions.js'
import type {
  SubagentDispatchEvidence,
  SubagentDispatcher,
} from '../../hivemind/subagent-dispatcher.js'
import { parseSkillRunInput, renderSkillRunResult, runSkill } from '../../skills/skill-runtime.js'

export function createWiredSkillRunTool(
  dispatcher: SubagentDispatcher,
  onResult?: (result: SubagentDispatchEvidence) => void,
): RuntimeToolDefinition {
  return {
    name: 'skill_run',
    description:
      'Run a SymbolWright Skill from .symbolwright/skills, compatible .claude/skills, .claude/commands, or bundled skills. Forked skills route through isolated subagents.',
    capability: 'SKILL',
    execute: async (input: unknown, context: RuntimeToolContext): Promise<string> => {
      const request = parseSkillRunInput(input)
      const result = await runSkill({
        cwd: context.cwd,
        request,
        context,
        forkRunner: async (forkRequest) => {
          const evidence = await dispatcher.dispatch({
            subagent: forkRequest.agent as SubagentName,
            goal: forkRequest.goal,
            enableGovernedTools: forkRequest.enableGovernedTools,
          })
          onResult?.(evidence)
          return renderSubagentEvidence(evidence)
        },
      })
      return renderSkillRunResult(result)
    },
  }
}

export const skillRunTool: RuntimeToolDefinition = {
  name: 'skill_run',
  description:
    'Run a SymbolWright Skill from .symbolwright/skills, compatible .claude/skills, .claude/commands, or bundled skills. Forked skills require an activated subagent dispatcher.',
  capability: 'SKILL',
  execute: async (input: unknown, context: RuntimeToolContext): Promise<string> => {
    const request = parseSkillRunInput(input)
    const result = await runSkill({
      cwd: context.cwd,
      request,
      context,
    })
    return renderSkillRunResult(result)
  },
}
