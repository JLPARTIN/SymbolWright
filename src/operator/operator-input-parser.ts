import type { OperatorCommandName, ParsedOperatorInput } from './operator-types.js'

const OPERATOR_COMMAND_ALIASES: Record<string, OperatorCommandName> = {
  '/?': 'help',
  '/h': 'help',
  '/help': 'help',
  '/status': 'status',
  '/doctor': 'doctor',
  '/runtime-status': 'runtime-status',
  '/runtime': 'runtime-status',
  '/scan': 'scan',
  '/plan': 'plan',
  '/run': 'run',
  '/read': 'read',
  '/search': 'search',
  '/validation-plan': 'validation-plan',
  '/validate-plan': 'validation-plan',
  '/propose': 'propose',
  '/propose-patch': 'propose',
  '/pr-notes': 'pr-notes',
  '/zflow': 'zflow',
  '/workspace': 'workspace',
  '/history': 'history',
  '/session': 'session',
  '/clear': 'clear',
  '/exit': 'exit',
  '/quit': 'exit',
}

export function parseOperatorInput(raw: string): ParsedOperatorInput {
  const trimmed = raw.trim()

  if (trimmed.length === 0) {
    return { kind: 'empty', raw }
  }

  if (!trimmed.startsWith('/')) {
    return { kind: 'mission', raw, goal: trimmed }
  }

  const parts = splitOperatorArgs(trimmed)
  const token = parts[0]
  const command = token === undefined ? undefined : OPERATOR_COMMAND_ALIASES[token.toLowerCase()]

  if (command === undefined) {
    return {
      kind: 'invalid',
      raw,
      error: `Unknown operator command: ${token ?? trimmed}`,
    }
  }

  return {
    kind: 'slash',
    raw,
    command,
    args: parts.slice(1),
  }
}

export function splitOperatorArgs(input: string): string[] {
  return input
    .trim()
    .split(/ +/u)
    .filter((part) => part.length > 0)
}

export function joinOperatorArgs(args: readonly string[]): string {
  return args.join(' ').trim()
}
