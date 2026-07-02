import { describe, expect, it, vi } from 'vitest'

import type { RuntimeToolContext } from '../types.js'
import { memoryStoreTool } from './memory-store-tool.js'

function baseContext(): RuntimeToolContext {
  return {
    cwd: '/repo',
    policy: {
      mode: 'APPROVED_EXECUTION',
      allowNetwork: false,
      allowReadOnlyNetwork: true,
      allowShell: true,
      allowWrites: true,
      allowGitHubWrites: false,
      protectedPaths: [],
      noisyDirs: [],
    },
  }
}

describe('memoryStoreTool', () => {
  it('reports memory as uninitialized when no memoryTools are provided', async () => {
    const result = await memoryStoreTool.execute(
      { type: 'episodic', content: 'note' },
      baseContext(),
    )
    expect(result).toBe('Memory is not initialized for this session.')
  })

  it('calls memory_store with type, content, and metadata', async () => {
    const memory_store = vi.fn().mockReturnValue('Memory stored successfully with ID: mem-1')
    const context: RuntimeToolContext = {
      ...baseContext(),
      memoryTools: { memory_store } as never,
    }

    const result = await memoryStoreTool.execute(
      { type: 'procedural', content: 'Always use Zod', metadata: { source: 'user' } },
      context,
    )

    expect(memory_store).toHaveBeenCalledWith('procedural', 'Always use Zod', { source: 'user' })
    expect(result).toContain('Memory stored successfully')
  })

  it('defaults metadata to an empty object when omitted', async () => {
    const memory_store = vi.fn().mockReturnValue('ok')
    const context: RuntimeToolContext = {
      ...baseContext(),
      memoryTools: { memory_store } as never,
    }

    await memoryStoreTool.execute({ type: 'lexical', content: 'x' }, context)

    expect(memory_store).toHaveBeenCalledWith('lexical', 'x', {})
  })

  it('throws for an invalid store type', async () => {
    await expect(
      memoryStoreTool.execute({ type: 'invalid', content: 'x' }, baseContext()),
    ).rejects.toThrow('memory_store requires "type" to be one of episodic, lexical, procedural.')
  })

  it('throws when content is missing', async () => {
    await expect(
      memoryStoreTool.execute({ type: 'episodic', content: '' }, baseContext()),
    ).rejects.toThrow('memory_store requires a non-empty "content" string.')
  })

  it('throws when input is not an object', async () => {
    await expect(memoryStoreTool.execute(undefined, baseContext())).rejects.toThrow(
      'Missing memory store input.',
    )
  })
})
