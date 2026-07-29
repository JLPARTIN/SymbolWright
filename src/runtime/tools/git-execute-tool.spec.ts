import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { createDefaultRuntimePolicy } from '../policy/runtime-policy.js'
import type { RuntimeApproval, RuntimeToolContext } from '../types.js'
import { executeGitTool } from './git-execute-tool.js'

function makeContext(overrides: Partial<RuntimeToolContext> = {}): RuntimeToolContext {
  return {
    cwd: process.cwd(),
    policy: createDefaultRuntimePolicy(),
    ...overrides,
  }
}

function makeGitWorkspace(): string {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'symbolwright-git-'))
  spawnSync('git', ['init'], { cwd: workspace })
  fs.writeFileSync(path.join(workspace, 'file.txt'), 'hello')
  return workspace
}

function makeApprovedContext(): RuntimeToolContext {
  const approval: RuntimeApproval = {
    ticketId: 'TEST-001',
    approvedBy: 'test',
    scopes: ['git:write', 'file:write', 'shell:execute'],
  }
  return {
    cwd: process.cwd(),
    policy: {
      ...createDefaultRuntimePolicy(),
      mode: 'APPROVED_EXECUTION',
      allowShell: true,
      allowWrites: true,
    },
    approval,
  }
}

describe('executeGitTool', () => {
  it('throws on missing operation', async () => {
    await expect(executeGitTool({}, makeContext())).rejects.toThrow('Missing operation')
  })

  it('throws on invalid operation', async () => {
    await expect(executeGitTool({ operation: 'rebase' }, makeContext())).rejects.toThrow(
      'Invalid git operation',
    )
  })

  it('throws on null input', async () => {
    await expect(executeGitTool(null, makeContext())).rejects.toThrow('Missing operation')
  })

  it('blocks write operations when policy disables writes', async () => {
    const output = await executeGitTool(
      { operation: 'add', args: ['.'] },
      makeContext({
        policy: {
          ...createDefaultRuntimePolicy(),
          allowWrites: false,
        },
      }),
    )

    expect(output).toContain('Allowed: no')
    expect(output).toContain('requires write permission')
  })

  it('executes git add for a trusted local operator when writes are allowed', async () => {
    const workspace = makeGitWorkspace()
    try {
      const output = await executeGitTool(
        { operation: 'add', args: ['file.txt'] },
        {
          cwd: workspace,
          policy: {
            ...createDefaultRuntimePolicy(),
            allowWrites: true,
          },
        },
      )

      expect(output).toContain('Git operation: add')
      expect(output).toContain('Command: git add file.txt')
      expect(output).not.toContain('requires write permission')
    } finally {
      fs.rmSync(workspace, { recursive: true, force: true })
    }
  })

  it('denies delegated callers before a host Git process can run', async () => {
    await expect(
      executeGitTool(
        { operation: 'status' },
        makeContext({
          accessControl: {
            principalId: 'principal-1',
            grantId: 'grant-1',
            requireAuthorized: async () => undefined,
          },
        }),
      ),
    ).rejects.toThrow(/TRUSTED_OPERATOR_GIT_REQUIRED/)
  })

  it('denies host Git for an externally acquired untrusted repository', async () => {
    await expect(
      executeGitTool({ operation: 'status' }, makeContext({ untrustedRepositoryContent: true })),
    ).rejects.toThrow(/TRUSTED_OPERATOR_GIT_REQUIRED/)
  })

  it('executes read operations in read-only mode for a trusted operator', async () => {
    const output = await executeGitTool({ operation: 'status' }, makeContext())

    expect(output).toContain('Git operation: status')
    expect(output).toContain('Exit code:')
    expect(output).toContain('Boundary:')
  })

  it('executes diff in read-only mode', async () => {
    const output = await executeGitTool({ operation: 'diff' }, makeContext())

    expect(output).toContain('Git operation: diff')
    expect(output).toContain('Command: git diff')
  })

  it('executes log in read-only mode', async () => {
    const output = await executeGitTool(
      { operation: 'log', args: ['--oneline', '-5'] },
      makeContext(),
    )

    expect(output).toContain('Git operation: log')
    expect(output).toContain('Command: git log --oneline -5')
  })

  it('executes branch in read-only mode', async () => {
    const output = await executeGitTool({ operation: 'branch' }, makeContext())

    expect(output).toContain('Git operation: branch')
  })

  it('blocks push to protected branches', async () => {
    const output = await executeGitTool(
      { operation: 'push', args: ['origin', 'main'] },
      makeApprovedContext(),
    )

    expect(output).toContain('Allowed: no')
    expect(output).toContain('protected branch')
  })

  it('blocks force push', async () => {
    const output = await executeGitTool(
      { operation: 'push', args: ['--force', 'origin', 'HEAD'] },
      makeApprovedContext(),
    )

    expect(output).toContain('Allowed: no')
    expect(output).toContain('Force push')
  })

  it('executes commit with message in approved mode', async () => {
    const output = await executeGitTool(
      { operation: 'commit', message: 'test commit' },
      makeApprovedContext(),
    )

    expect(output).toContain('Git operation: commit')
    expect(output).toContain('Command: git commit -m test commit')
  })

  it('handles checkout_new operation without mutating the caller repository', async () => {
    const workspace = makeGitWorkspace()
    try {
      const branchName = 'test-branch-' + Date.now()
      const context: RuntimeToolContext = {
        ...makeApprovedContext(),
        cwd: workspace,
      }

      const output = await executeGitTool(
        { operation: 'checkout_new', args: [branchName] },
        context,
      )
      expect(output).toContain('Git operation: checkout_new')
      expect(output).toContain('Command: git checkout -b')

      const currentBranch = spawnSync('git', ['branch', '--show-current'], {
        cwd: workspace,
        encoding: 'utf-8',
      })
      expect(currentBranch.status).toBe(0)
      expect(currentBranch.stdout.trim()).toBe(branchName)
    } finally {
      fs.rmSync(workspace, { recursive: true, force: true })
    }
  })
})
