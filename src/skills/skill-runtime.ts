import type { RuntimeToolContext } from '../runtime/types.js'
import { requireSkillByName } from './skill-discovery.js'
import { renderSkillContent } from './skill-renderer.js'
import type { SkillRunInput, SkillRunResult } from './skill-types.js'

export interface SkillForkRunRequest {
  readonly agent: string
  readonly goal: string
  readonly enableGovernedTools: boolean
}

export type SkillForkRunner = (request: SkillForkRunRequest) => Promise<string>

export function parseSkillRunInput(input: unknown): SkillRunInput {
  if (typeof input !== 'object' || input === null) {
    throw new Error('Missing input: skill_run requires a skill name')
  }

  const raw = input as Record<string, unknown>
  const name = raw['name']
  if (typeof name !== 'string' || name.trim().length === 0) {
    throw new Error('Missing skill name')
  }

  const mode = raw['mode']
  if (mode !== undefined && mode !== 'inline' && mode !== 'fork') {
    throw new Error('skill_run mode must be inline or fork')
  }

  return {
    name: name.trim(),
    ...(typeof raw['arguments'] === 'string' ? { arguments: raw['arguments'] } : {}),
    ...(mode === 'inline' || mode === 'fork' ? { mode } : {}),
    ...(typeof raw['enableGovernedTools'] === 'boolean'
      ? { enableGovernedTools: raw['enableGovernedTools'] }
      : {}),
    ...(typeof raw['dynamicContext'] === 'boolean' ? { dynamicContext: raw['dynamicContext'] } : {}),
  }
}

export async function runSkill(input: {
  readonly cwd: string
  readonly request: SkillRunInput
  readonly context: RuntimeToolContext
  readonly sessionId?: string
  readonly forkRunner?: SkillForkRunner
}): Promise<SkillRunResult> {
  const skill = requireSkillByName(input.request.name, input.cwd)
  const sessionId = input.sessionId ?? input.context.sessionId ?? `cm-skill-${Date.now()}`
  const rendered = await renderSkillContent(
    {
      skill,
      ...(input.request.arguments !== undefined ? { rawArguments: input.request.arguments } : {}),
      sessionId,
      projectDir: input.cwd,
      dynamicContext: input.request.dynamicContext ?? true,
      disableShellExecution: process.env['CODEMIND_DISABLE_SKILL_SHELL_EXECUTION'] === '1',
    },
    input.context,
  )

  const requestedMode = input.request.mode ?? skill.context
  if (requestedMode === 'fork' || skill.context === 'fork') {
    if (input.forkRunner !== undefined) {
      const dispatchOutput = await input.forkRunner({
        agent: skill.agent ?? 'explorer',
        goal: rendered.content,
        enableGovernedTools: input.request.enableGovernedTools ?? false,
      })
      return {
        skill,
        status: 'dispatched',
        renderedContent: rendered.content,
        dynamicCommandCount: rendered.dynamicCommandCount,
        blockedDynamicCommandCount: rendered.blockedDynamicCommandCount,
        dispatchOutput,
      }
    }
  }

  return {
    skill,
    status: 'rendered',
    renderedContent: rendered.content,
    dynamicCommandCount: rendered.dynamicCommandCount,
    blockedDynamicCommandCount: rendered.blockedDynamicCommandCount,
  }
}

export function renderSkillRunResult(result: SkillRunResult): string {
  const lines = [
    'CodeMind skill run',
    '',
    `Skill: ${result.skill.commandName}`,
    `Source: ${result.skill.source}`,
    `Context: ${result.skill.context}`,
    `Status: ${result.status.toUpperCase()}`,
    `Dynamic commands: ${result.dynamicCommandCount}`,
    `Blocked dynamic commands: ${result.blockedDynamicCommandCount}`,
    '',
  ]

  if (result.dispatchOutput !== undefined) {
    lines.push('Dispatch output:', result.dispatchOutput)
    return lines.join('\n')
  }

  lines.push('Rendered skill content:', result.renderedContent)
  if (result.skill.context === 'fork') {
    lines.push(
      '',
      'Note: This forked skill was rendered without an active subagent dispatcher. In an activated agent session, skill_run is wired to the real subagent runtime.',
    )
  }
  return lines.join('\n')
}
