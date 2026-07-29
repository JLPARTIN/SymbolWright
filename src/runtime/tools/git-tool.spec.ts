import { describe, expect, it } from 'vitest'

import type { RuntimePolicySnapshot } from '../types.js'
import {
  evaluateGitToolRequest,
  READ_OPERATIONS,
  renderGitToolResult,
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

    it('blocks force push variants and leading-plus refspecs', () => {
      for (const args of [
        ['--force', 'origin', 'HEAD'],
        ['--force-with-lease=refs/heads/topic', 'origin', 'HEAD'],
        ['origin', '+HEAD'],
      ]) {
        const result = evaluateGitToolRequest({ operation: 'push', args }, makePolicy())
        expect(result.allowed).toBe(false)
        expect(result.blockReasons).toContain('Force push is not allowed.')
      }
    })

    it('blocks protected branches in direct and canonical ref forms', () => {
      for (const target of ['main', 'refs/heads/main', 'master']) {
        const result = evaluateGitToolRequest(
          { operation: 'push', args: ['origin', target] },
          makePolicy(),
        )
        expect(result.allowed).toBe(false)
        expect(result.blockReasons.join(' ')).toContain('protected branch')
      }
    })

    it('blocks refspec, URL, aggregate, delete, and repository-override push forms', () => {
      for (const args of [
        ['origin', 'HEAD:main'],
        ['https://evil.example/repository.git', 'HEAD'],
        ['--all', 'origin'],
        ['--mirror', 'origin'],
        ['--delete', 'origin', 'topic'],
        ['--repo=https://evil.example/repository.git', 'origin', 'HEAD'],
      ]) {
        expect(evaluateGitToolRequest({ operation: 'push', args }, makePolicy()).allowed).toBe(
          false,
        )
      }
    })

    it('requires the explicit origin remote', () => {
      expect(
        evaluateGitToolRequest({ operation: 'push', args: ['upstream', 'topic'] }, makePolicy())
          .allowed,
      ).toBe(false)
      expect(evaluateGitToolRequest({ operation: 'push' }, makePolicy()).allowed).toBe(false)
    })

    it('allows a narrow push to a feature branch', () => {
      const result = evaluateGitToolRequest(
        { operation: 'push', args: ['-u', 'origin', 'feature/my-branch'] },
        makePolicy(),
      )
      expect(result.allowed).toBe(true)
    })

    it('blocks checkout to protected or revision-shaped branches', () => {
      for (const branch of ['main', '--orphan', '../escape', 'topic..other']) {
        expect(
          evaluateGitToolRequest({ operation: 'checkout_new', args: [branch] }, makePolicy())
            .allowed,
        ).toBe(false)
      }
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
    const result = evaluateGitToolRequest(
      { operation: 'push', args: ['--force', 'origin', 'HEAD'] },
      makePolicy(),
    )
    const rendered = renderGitToolResult(result)
    expect(rendered).toContain('Allowed: no')
    expect(rendered).toContain('Force push')
  })
})
