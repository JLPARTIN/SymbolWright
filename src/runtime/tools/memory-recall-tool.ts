import type { RuntimeToolContext, RuntimeToolDefinition } from '../types.js'

export interface MemoryRecallToolInput {
  readonly query: string
  readonly changedFiles?: readonly string[]
}

function parseMemoryRecallInput(input: unknown): MemoryRecallToolInput {
  if (typeof input !== 'object' || input === null) {
    throw new Error('Missing memory recall input.')
  }

  const obj = input as Record<string, unknown>
  const query = obj['query']
  if (typeof query !== 'string' || query.trim().length === 0) {
    throw new Error('memory_recall requires a non-empty "query" string.')
  }

  const changedFiles = obj['changedFiles']
  return {
    query,
    ...(Array.isArray(changedFiles)
      ? { changedFiles: changedFiles.filter((entry): entry is string => typeof entry === 'string') }
      : {}),
  }
}

export const memoryRecallTool: RuntimeToolDefinition = {
  name: 'memory_recall',
  description:
    'Recall prior episodic, lexical, and procedural memory relevant to a query, including past user corrections, resolved mistakes, and repo conventions.',
  capability: 'MEMORY_ACCESS',
  execute: async (input: unknown, context: RuntimeToolContext): Promise<string> => {
    const parsed = parseMemoryRecallInput(input)

    if (context.memoryTools === undefined) {
      return 'Memory is not initialized for this session.'
    }

    return context.memoryTools.memory_recall(parsed.query, parsed.changedFiles ?? [])
  },
}
