import type { AgentMemoryStoreType } from '../../memory/agent-tools.js'
import type { RuntimeToolContext, RuntimeToolDefinition } from '../types.js'

const VALID_STORE_TYPES: readonly AgentMemoryStoreType[] = ['episodic', 'lexical', 'procedural']

export interface MemoryStoreToolInput {
  readonly type: AgentMemoryStoreType
  readonly content: string
  readonly metadata?: Record<string, unknown>
}

function isAgentMemoryStoreType(value: unknown): value is AgentMemoryStoreType {
  return typeof value === 'string' && (VALID_STORE_TYPES as readonly string[]).includes(value)
}

function parseMemoryStoreInput(input: unknown): MemoryStoreToolInput {
  if (typeof input !== 'object' || input === null) {
    throw new Error('Missing memory store input.')
  }

  const obj = input as Record<string, unknown>
  const type = obj['type']
  const content = obj['content']

  if (!isAgentMemoryStoreType(type)) {
    throw new Error('memory_store requires "type" to be one of episodic, lexical, procedural.')
  }
  if (typeof content !== 'string' || content.trim().length === 0) {
    throw new Error('memory_store requires a non-empty "content" string.')
  }

  const metadata = obj['metadata']
  return {
    type,
    content,
    ...(typeof metadata === 'object' && metadata !== null && !Array.isArray(metadata)
      ? { metadata: metadata as Record<string, unknown> }
      : {}),
  }
}

export const memoryStoreTool: RuntimeToolDefinition = {
  name: 'memory_store',
  description:
    'Store a durable episodic, lexical, or procedural memory (e.g. a user correction or repo convention) for future recall.',
  capability: 'MEMORY_ACCESS',
  execute: async (input: unknown, context: RuntimeToolContext): Promise<string> => {
    const parsed = parseMemoryStoreInput(input)

    if (context.memoryTools === undefined) {
      return 'Memory is not initialized for this session.'
    }

    return context.memoryTools.memory_store(parsed.type, parsed.content, parsed.metadata ?? {})
  },
}
