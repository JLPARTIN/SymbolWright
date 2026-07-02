import type { RuntimeToolContext } from '../runtime/types.js'
import { executeBashTool } from '../runtime/tools/bash-tool.js'
import type { RenderedSkill, SkillDefinition, SkillRenderInput } from './skill-types.js'

const ESCAPED_DOLLAR_SENTINEL = '\u0000CODEMIND_ESCAPED_DOLLAR\u0000'

interface DynamicRenderState {
  readonly lines: readonly string[]
  readonly dynamicCommandCount: number
  readonly blockedDynamicCommandCount: number
}

function parseSkillArguments(rawArguments: string): readonly string[] {
  const args: string[] = []
  const pattern = /"([^"]*)"|'([^']*)'|(\S+)/gu
  for (const match of rawArguments.matchAll(pattern)) {
    args.push(match[1] ?? match[2] ?? match[3] ?? '')
  }
  return args
}

function replaceUnescapedDollars(content: string, replacement: (content: string) => string): string {
  return replacement(content.replace(/\\\$/gu, ESCAPED_DOLLAR_SENTINEL)).replace(
    new RegExp(ESCAPED_DOLLAR_SENTINEL, 'gu'),
    '$',
  )
}

function substituteArguments(input: SkillRenderInput): string {
  const rawArguments = input.rawArguments ?? ''
  const parsedArgs = parseSkillArguments(rawArguments)
  const namedArgs = new Map<string, string>()

  input.skill.arguments.forEach((name, index) => {
    namedArgs.set(name, parsedArgs[index] ?? '')
  })

  return replaceUnescapedDollars(input.skill.body, (content) => {
    let rendered = content
      .replace(/\$ARGUMENTS\[(\d+)]/gu, (_match, index: string) => parsedArgs[Number(index)] ?? '')
      .replace(/\$(\d+)/gu, (_match, index: string) => parsedArgs[Number(index)] ?? '')
      .replace(/\$ARGUMENTS/gu, rawArguments)
      .replace(/\$\{CODEMIND_SESSION_ID}/gu, input.sessionId)
      .replace(/\$\{CLAUDE_SESSION_ID}/gu, input.sessionId)
      .replace(/\$\{CODEMIND_SKILL_DIR}/gu, input.skill.skillDir)
      .replace(/\$\{CLAUDE_SKILL_DIR}/gu, input.skill.skillDir)
      .replace(/\$\{CODEMIND_PROJECT_DIR}/gu, input.projectDir)
      .replace(/\$\{CLAUDE_PROJECT_DIR}/gu, input.projectDir)

    for (const [name, value] of namedArgs.entries()) {
      rendered = rendered.replace(new RegExp(`\\$${name}\\b`, 'gu'), value)
    }

    return rendered
  })
}

async function executeDynamicCommand(
  command: string,
  input: SkillRenderInput,
  context: RuntimeToolContext,
): Promise<{ readonly output: string; readonly blocked: boolean }> {
  if (!input.dynamicContext || input.disableShellExecution) {
    return { output: '[skill shell command execution disabled by policy]', blocked: true }
  }

  if (input.skill.shell !== 'bash') {
    return {
      output: `[skill shell ${input.skill.shell} is not supported by this runtime yet]`,
      blocked: true,
    }
  }

  const output = await executeBashTool(
    { command, timeoutMs: 30_000 },
    context.cwd,
    context.policy.allowShell,
    context.sandboxRunner,
  )
  return { output, blocked: output.includes('Status: BLOCKED') }
}

async function renderInlineDynamicCommands(
  lines: readonly string[],
  input: SkillRenderInput,
  context: RuntimeToolContext,
): Promise<DynamicRenderState> {
  const rendered: string[] = []
  let dynamicCommandCount = 0
  let blockedDynamicCommandCount = 0

  for (const line of lines) {
    const match = /^(\s*)!`([^`]+)`\s*$/u.exec(line)
    if (match === null) {
      rendered.push(line)
      continue
    }

    dynamicCommandCount += 1
    const output = await executeDynamicCommand(match[2] ?? '', input, context)
    if (output.blocked) blockedDynamicCommandCount += 1
    rendered.push(`${match[1] ?? ''}${output.output}`)
  }

  return { lines: rendered, dynamicCommandCount, blockedDynamicCommandCount }
}

async function renderFencedDynamicCommands(
  content: string,
  input: SkillRenderInput,
  context: RuntimeToolContext,
): Promise<DynamicRenderState> {
  const lines = content.split('\n')
  const rendered: string[] = []
  let dynamicCommandCount = 0
  let blockedDynamicCommandCount = 0

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index] ?? ''
    if (line.trim() !== '```!') {
      rendered.push(line)
      continue
    }

    const commandLines: string[] = []
    index += 1
    while (index < lines.length && (lines[index] ?? '').trim() !== '```') {
      commandLines.push(lines[index] ?? '')
      index += 1
    }

    dynamicCommandCount += 1
    const command = commandLines.join('\n').trim()
    const output = await executeDynamicCommand(command, input, context)
    if (output.blocked) blockedDynamicCommandCount += 1
    rendered.push(output.output)
  }

  return { lines: rendered, dynamicCommandCount, blockedDynamicCommandCount }
}

export async function renderSkillContent(
  input: SkillRenderInput,
  context: RuntimeToolContext,
): Promise<RenderedSkill> {
  const substituted = substituteArguments(input)
  const fenced = await renderFencedDynamicCommands(substituted, input, context)
  const inline = await renderInlineDynamicCommands(fenced.lines, input, context)

  return {
    skill: input.skill,
    content: inline.lines.join('\n'),
    dynamicCommandCount: fenced.dynamicCommandCount + inline.dynamicCommandCount,
    blockedDynamicCommandCount:
      fenced.blockedDynamicCommandCount + inline.blockedDynamicCommandCount,
  }
}

export function renderSkillListing(skills: readonly SkillDefinition[]): string {
  return [
    'CodeMind skills',
    '',
    ...skills.map((skill) => {
      const invocation = skill.userInvocable ? `codemind skill run ${skill.commandName}` : '(agent-only)'
      const auto = skill.disableModelInvocation ? 'manual' : 'auto/manual'
      return `- ${skill.commandName} [${skill.source}; ${auto}]\n  ${skill.description}\n  Invoke: ${invocation}`
    }),
  ].join('\n')
}

export function renderSkillDetails(skill: SkillDefinition): string {
  return [
    'CodeMind skill',
    '',
    `Name: ${skill.commandName}`,
    `Display: ${skill.displayName}`,
    `Source: ${skill.source}`,
    `Entry: ${skill.entryPath}`,
    `Description: ${skill.description}`,
    ...(skill.whenToUse !== undefined ? [`When to use: ${skill.whenToUse}`] : []),
    ...(skill.argumentHint !== undefined ? [`Arguments: ${skill.argumentHint}`] : []),
    `Context: ${skill.context}`,
    ...(skill.agent !== undefined ? [`Agent: ${skill.agent}`] : []),
    `User invocable: ${skill.userInvocable}`,
    `Model invocation: ${skill.disableModelInvocation ? 'disabled/manual only' : 'allowed'}`,
    `Allowed tools: ${skill.allowedTools.length > 0 ? skill.allowedTools.join(', ') : '(inherits runtime)'}`,
    `Disallowed tools: ${skill.disallowedTools.length > 0 ? skill.disallowedTools.join(', ') : '(none)'}`,
    `Dynamic shell: ${skill.shell}`,
  ].join('\n')
}
