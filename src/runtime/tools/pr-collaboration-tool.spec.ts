import { describe, expect, it } from 'vitest'

import type { RuntimeApproval, RuntimePolicySnapshot, RuntimeToolContext } from '../types.js'
import { FakePrCollaborationClient } from '../github-write/fake-pr-collaboration-client.js'
import { createHashEmbeddingProvider } from '../../memory/embedding-provider.js'
import { prCollaborationTool } from './pr-collaboration-tool.js'

const ghWritePolicy: RuntimePolicySnapshot = {
  mode: 'APPROVED_EXECUTION',
  allowNetwork: false,
  allowReadOnlyNetwork: true,
  allowShell: false,
  allowWrites: true,
  allowGitHubWrites: true,
  protectedPaths: [],
  noisyDirs: [],
}

const blockedPolicy: RuntimePolicySnapshot = {
  mode: 'READ_ONLY',
  allowNetwork: false,
  allowReadOnlyNetwork: true,
  allowShell: false,
  allowWrites: false,
  allowGitHubWrites: false,
  protectedPaths: [],
  noisyDirs: [],
}

const approval: RuntimeApproval = {
  ticketId: 'COLLAB-001',
  approvedBy: 'operator',
  scopes: ['github:write'],
}

function makeContext(
  policy: RuntimePolicySnapshot,
  runtimeApproval?: RuntimeApproval,
): RuntimeToolContext {
  const fakeClient = new FakePrCollaborationClient()
  const base = {
    cwd: process.cwd(),
    policy,
    embeddingProvider: createHashEmbeddingProvider(),
    githubClients: { collaborationClient: fakeClient },
  }
  if (runtimeApproval !== undefined) {
    return { ...base, approval: runtimeApproval }
  }
  return base
}

const commentInput = {
  action: 'post_comment' as const,
  repository: 'owner/repo',
  prNumber: 42,
  content: 'LGTM',
  reason: 'review feedback',
  dryRun: true,
}

const labelInput = {
  action: 'apply_label' as const,
  repository: 'owner/repo',
  prNumber: 42,
  content: 'approved',
  reason: 'marking approved',
  dryRun: true,
}

describe('prCollaborationTool', () => {
  it('has correct name and capability', () => {
    expect(prCollaborationTool.name).toBe('pr_collaboration')
    expect(prCollaborationTool.capability).toBe('GITHUB_PR_COLLABORATION')
  })

  it('throws on null input', async () => {
    await expect(
      prCollaborationTool.execute(null, makeContext(ghWritePolicy, approval)),
    ).rejects.toThrow('Missing PR collaboration input')
  })

  it('throws on unsupported action', async () => {
    await expect(
      prCollaborationTool.execute(
        { ...commentInput, action: 'merge' },
        makeContext(ghWritePolicy, approval),
      ),
    ).rejects.toThrow('Unsupported PR collaboration action')
  })

  it('throws on missing repository', async () => {
    await expect(
      prCollaborationTool.execute(
        { ...commentInput, repository: '' },
        makeContext(ghWritePolicy, approval),
      ),
    ).rejects.toThrow('Missing repository')
  })

  it('throws on missing prNumber', async () => {
    await expect(
      prCollaborationTool.execute(
        { ...commentInput, prNumber: 'not-a-number' },
        makeContext(ghWritePolicy, approval),
      ),
    ).rejects.toThrow('Missing prNumber')
  })

  it('throws on missing content', async () => {
    await expect(
      prCollaborationTool.execute(
        { ...commentInput, content: '' },
        makeContext(ghWritePolicy, approval),
      ),
    ).rejects.toThrow('Missing content')
  })

  it('throws on missing reason', async () => {
    await expect(
      prCollaborationTool.execute(
        { ...commentInput, reason: '' },
        makeContext(ghWritePolicy, approval),
      ),
    ).rejects.toThrow('Missing reason')
  })

  it('renders dry-run comment output with audit', async () => {
    const output = await prCollaborationTool.execute(
      commentInput,
      makeContext(ghWritePolicy, approval),
    )

    expect(output).toContain('DRY_RUN')
    expect(output).toContain('post_comment')
    expect(output).toContain('Runtime audit log')
  })

  it('renders dry-run label output', async () => {
    const output = await prCollaborationTool.execute(
      labelInput,
      makeContext(ghWritePolicy, approval),
    )

    expect(output).toContain('DRY_RUN')
    expect(output).toContain('apply_label')
  })

  it('blocks when policy disables GitHub writes', async () => {
    const output = await prCollaborationTool.execute(
      commentInput,
      makeContext(blockedPolicy, approval),
    )

    expect(output).toContain('BLOCKED')
  })

  it('blocks without approval', async () => {
    const output = await prCollaborationTool.execute(commentInput, makeContext(ghWritePolicy))

    expect(output).toContain('BLOCKED')
  })

  it('falls back to fake client when no githubClients on context', async () => {
    const context: RuntimeToolContext = {
      cwd: process.cwd(),
      policy: ghWritePolicy,
      approval,
      embeddingProvider: createHashEmbeddingProvider(),
    }
    const output = await prCollaborationTool.execute(commentInput, context)

    expect(output).toContain('DRY_RUN')
  })

  it('defaults dryRun to true when not provided', async () => {
    const { dryRun: _, ...noDryRun } = commentInput
    const output = await prCollaborationTool.execute(noDryRun, makeContext(ghWritePolicy, approval))

    expect(output).toContain('DRY_RUN')
  })
})
