import { describe, expect, it } from 'vitest'

import type { RuntimePolicySnapshot } from '../types.js'
import {
  evaluateGitToolRequest,
  renderGitToolResult,
  READ_OPERATIONS,
  WRITE_OPERATIONS,
} from './git-tool.js'

function makePolicy(overrides: Partial<RuntimePolicySnapshot> = {}): RuntimePolicySnapshot {
  return {
    mode: 'APPROVED_EXECUTION',
    allowNetwork: true,
    allowReadOnlyNetwork: true,
    allowShell: true,
    allowWrites: true,
    allowGitHubWrites: false,
    protectedPaths: [],
    noisyDirs: [],
    ...overrides,
  }
}

describe('evaluateGitToolRequest', () => {
  describe('read operations', () => {
    it('allows status in read-only mode', () => {
      const result = evaluateGitToolRequest(
        { operation: 'status' },
        makePolicy({ allowWrites: false }),
      )
      expect(result.allowed).toBe(true)
      expect(result.command).toContain('git status')
    })

    it('allows diff in read-only mode', () => {
      const result = evaluateGitToolRequest(
        { operation: 'diff', args: ['HEAD~1'] },
        makePolicy({ allowWrites: false }),
      )
      expect(result.allowed).toBe(true)
      expect(result.command).toContain('git diff')
    })

    it('allows log in read-only mode', () => {
      const result = evaluateGitToolRequest(
        { operation: 'log', args: ['--oneline', '-10'] },
        makePolicy({ allowWrites: false }),
      )
      expect(result.allowed).toBe(true)
    })

    it('allows branch in read-only mode', () => {
      const result = evaluateGitToolRequest(
        { operation: 'branch' },
        makePolicy({ allowWrites: false }),
      )
      expect(result.allowed).toBe(true)
    })
  })

  describe('write operations', () => {
    it('allows commit with write permission', () => {
      const result = evaluateGitToolRequest(
        { operation: 'commit', message: 'fix bug' },
        makePolicy(),
      )
      expect(result.allowed).toBe(true)
      expect(result.command).toContain('git commit')
      expect(result.command).toContain('fix bug')
    })

    it('blocks commit without write permission', () => {
      const result = evaluateGitToolRequest(
        { operation: 'commit', message: 'fix' },
        makePolicy({ allowWrites: false }),
      )
      expect(result.allowed).toBe(false)
      expect(result.blockReasons.length).toBeGreaterThan(0)
    })

    it('blocks force push', () => {
      const result = evaluateGitToolRequest({ operation: 'push', args: ['--force'] }, makePolicy())
      expect(result.allowed).toBe(false)
      expect(result.blockReasons).toContain('Force push is not allowed.')
    })

    it('blocks push to main', () => {
      const result = evaluateGitToolRequest(
        { operation: 'push', args: ['origin', 'main'] },
        makePolicy(),
      )
      expect(result.allowed).toBe(false)
      expect(result.blockReasons[0]).toContain('main')
    })

    it('blocks push to master', () => {
      const result = evaluateGitToolRequest(
        { operation: 'push', args: ['origin', 'master'] },
        makePolicy(),
      )
      expect(result.allowed).toBe(false)
    })

    it('allows push to feature branch', () => {
      const result = evaluateGitToolRequest(
        { operation: 'push', args: ['-u', 'origin', 'feature/my-branch'] },
        makePolicy(),
      )
      expect(result.allowed).toBe(true)
    })

    it('blocks checkout to protected branch', () => {
      const result = evaluateGitToolRequest(
        { operation: 'checkout_new', args: ['main'] },
        makePolicy(),
      )
      expect(result.allowed).toBe(false)
    })
  })

  describe('operation classification', () => {
    it('has correct read operations', () => {
      expect(READ_OPERATIONS.has('status')).toBe(true)
      expect(READ_OPERATIONS.has('diff')).toBe(true)
      expect(READ_OPERATIONS.has('log')).toBe(true)
      expect(READ_OPERATIONS.has('branch')).toBe(true)
      expect(READ_OPERATIONS.has('show')).toBe(true)
    })

    it('has correct write operations', () => {
      expect(WRITE_OPERATIONS.has('checkout_new')).toBe(true)
      expect(WRITE_OPERATIONS.has('add')).toBe(true)
      expect(WRITE_OPERATIONS.has('commit')).toBe(true)
      expect(WRITE_OPERATIONS.has('push')).toBe(true)
    })
  })
})

describe('renderGitToolResult', () => {
  it('renders allowed result', () => {
    const result = evaluateGitToolRequest({ operation: 'status' }, makePolicy())
    const rendered = renderGitToolResult(result)
    expect(rendered).toContain('Allowed: yes')
  })

  it('renders blocked result with reasons', () => {
    const result = evaluateGitToolRequest({ operation: 'push', args: ['--force'] }, makePolicy())
    const rendered = renderGitToolResult(result)
    expect(rendered).toContain('Allowed: no')
    expect(rendered).toContain('Force push')
  })
})
