import { describe, expect, it, vi } from 'vitest'

import type { RuntimeToolContext } from '../types.js'
import { memoryRecallTool } from './memory-recall-tool.js'

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

describe('memoryRecallTool', () => {
  it('reports memory as uninitialized when no memoryTools are provided', async () => {
    const result = await memoryRecallTool.execute({ query: 'dark mode' }, baseContext())
    expect(result).toBe('Memory is not initialized for this session.')
  })

  it('calls memory_recall with query and changedFiles', async () => {
    const memory_recall = vi.fn().mockReturnValue('recalled content')
    const context: RuntimeToolContext = {
      ...baseContext(),
      memoryTools: { memory_recall } as never,
    }

    const result = await memoryRecallTool.execute(
      { query: 'dark mode', changedFiles: ['src/a.ts', 42] },
      context,
    )

    expect(memory_recall).toHaveBeenCalledWith('dark mode', ['src/a.ts'])
    expect(result).toBe('recalled content')
  })

  it('defaults changedFiles to an empty array when omitted', async () => {
    const memory_recall = vi.fn().mockReturnValue('ok')
    const context: RuntimeToolContext = {
      ...baseContext(),
      memoryTools: { memory_recall } as never,
    }

    await memoryRecallTool.execute({ query: 'convention' }, context)

    expect(memory_recall).toHaveBeenCalledWith('convention', [])
  })

  it('throws when query is missing', async () => {
    await expect(memoryRecallTool.execute({}, baseContext())).rejects.toThrow(
      'memory_recall requires a non-empty "query" string.',
    )
  })

  it('throws when input is not an object', async () => {
    await expect(memoryRecallTool.execute(null, baseContext())).rejects.toThrow(
      'Missing memory recall input.',
    )
  })
})
