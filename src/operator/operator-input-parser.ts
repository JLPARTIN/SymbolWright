import type { ParsedOperatorInput } from './operator-types.js'

export function parseOperatorInput(raw: string): ParsedOperatorInput {
  const trimmed = raw.trim()
  if (trimmed.length === 0) {
    return { kind: 'empty', raw }
  }
  if (trimmed.startsWith('/')) {
    return { kind: 'invalid', raw, error: `Unknown operator command: ${trimmed}` }
  }
  return { kind: 'mission', raw, goal: trimmed }
}
