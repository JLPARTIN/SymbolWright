import { describe, expect, it } from 'vitest'

import type { RuntimeApproval, RuntimePolicySnapshot, RuntimeToolContext } from '../types.js'
import { FakeGitHubPrCreationClient } from '../github-write/fake-github-pr-creation-client.js'
import { createHashEmbeddingProvider } from '../../memory/embedding-provider.js'
import { githubCreatePrTool } from './github-create-pr-tool.js'

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
  ticketId: 'PR-TOOL-001',
  approvedBy: 'operator',
  scopes: ['github:write'],
}

function makeContext(
  policy: RuntimePolicySnapshot,
  runtimeApproval?: RuntimeApproval,
): RuntimeToolContext {
  const fakeClient = new FakeGitHubPrCreationClient()
  const base = {
    cwd: process.cwd(),
    policy,
    embeddingProvider: createHashEmbeddingProvider(),
    githubClients: { prCreationClient: fakeClient },
  }
  if (runtimeApproval !== undefined) {
    return { ...base, approval: runtimeApproval }
  }
  return base
}

const validInput = {
  repository: 'owner/repo',
  baseBranch: 'main',
  headBranch: 'feat/test',
  title: 'Test PR',
  body: 'PR body',
  reason: 'testing',
  dryRun: true,
  files: [{ path: 'src/index.ts', content: 'export {}' }],
}

describe('githubCreatePrTool', () => {
  it('has correct name and capability', () => {
    expect(githubCreatePrTool.name).toBe('github_create_pr')
    expect(githubCreatePrTool.capability).toBe('GITHUB_PR_CREATION')
  })

  it('throws on null input', async () => {
    await expect(
      githubCreatePrTool.execute(null, makeContext(ghWritePolicy, approval)),
    ).rejects.toThrow('Missing GitHub create PR input')
  })

  it('throws on missing repository', async () => {
    await expect(
      githubCreatePrTool.execute(
        { ...validInput, repository: '' },
        makeContext(ghWritePolicy, approval),
      ),
    ).rejects.toThrow('Missing repository')
  })

  it('throws on missing baseBranch', async () => {
    await expect(
      githubCreatePrTool.execute(
        { ...validInput, baseBranch: '' },
        makeContext(ghWritePolicy, approval),
      ),
    ).rejects.toThrow('Missing baseBranch')
  })

  it('throws on missing title', async () => {
    await expect(
      githubCreatePrTool.execute(
        { ...validInput, title: '' },
        makeContext(ghWritePolicy, approval),
      ),
    ).rejects.toThrow('Missing title')
  })

  it('throws on missing reason', async () => {
    await expect(
      githubCreatePrTool.execute(
        { ...validInput, reason: '' },
        makeContext(ghWritePolicy, approval),
      ),
    ).rejects.toThrow('Missing reason')
  })

  it('throws on empty files array', async () => {
    await expect(
      githubCreatePrTool.execute(
        { ...validInput, files: [] },
        makeContext(ghWritePolicy, approval),
      ),
    ).rejects.toThrow('Missing files')
  })

  it('throws on file with missing path', async () => {
    await expect(
      githubCreatePrTool.execute(
        { ...validInput, files: [{ content: 'x' }] },
        makeContext(ghWritePolicy, approval),
      ),
    ).rejects.toThrow('must include path')
  })

  it('renders dry-run output with gate and audit sections', async () => {
    const output = await githubCreatePrTool.execute(
      validInput,
      makeContext(ghWritePolicy, approval),
    )

    expect(output).toContain('DRY_RUN')
    expect(output).toContain('owner/repo')
    expect(output).toContain('Runtime audit log')
  })

  it('blocks when policy disables GitHub writes', async () => {
    const output = await githubCreatePrTool.execute(
      validInput,
      makeContext(blockedPolicy, approval),
    )

    expect(output).toContain('BLOCKED')
  })

  it('blocks without approval', async () => {
    const output = await githubCreatePrTool.execute(validInput, makeContext(ghWritePolicy))

    expect(output).toContain('BLOCKED')
  })

  it('falls back to fake client when no githubClients on context', async () => {
    const context: RuntimeToolContext = {
      cwd: process.cwd(),
      policy: ghWritePolicy,
      approval,
      embeddingProvider: createHashEmbeddingProvider(),
    }
    const output = await githubCreatePrTool.execute(validInput, context)

    expect(output).toContain('DRY_RUN')
  })

  it('defaults dryRun to true when not provided', async () => {
    const { dryRun: _, ...noDryRun } = validInput
    const output = await githubCreatePrTool.execute(noDryRun, makeContext(ghWritePolicy, approval))

    expect(output).toContain('DRY_RUN')
  })
})
