import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { createGitHubOperationsPolicy } from './github-operations-policy.js'
import type { GitHubRepositoryTarget } from './github-repository-target.js'
import {
  buildRepositoryIntakeProfile,
  renderRepositoryIntakeProfile,
} from './repository-intake-profile.js'
import type { RepositoryAcquisitionResult } from './repository-acquisition.js'

function target(): GitHubRepositoryTarget {
  return {
    host: 'github.com',
    owner: 'JLPARTIN',
    repo: 'SymbolWright',
    targetType: 'repository',
    sourceUrl: 'https://github.com/JLPARTIN/SymbolWright',
    canonicalHttpsUrl: 'https://github.com/JLPARTIN/SymbolWright',
  }
}

function acquisition(
  overrides: Partial<RepositoryAcquisitionResult> = {},
): RepositoryAcquisitionResult {
  return {
    strategy: 'clone',
    mode: 'writable',
    acquired: true,
    workspacePath: '/tmp/does-not-matter',
    sourceUrl: 'https://github.com/JLPARTIN/SymbolWright',
    evidence: ['Clone completed.'],
    ...overrides,
  }
}

describe('buildRepositoryIntakeProfile', () => {
  let workspacePath: string

  beforeEach(() => {
    workspacePath = mkdtempSync(join(tmpdir(), 'symbolwright-intake-profile-'))
    writeFileSync(
      join(workspacePath, 'package.json'),
      JSON.stringify({ name: 'x', scripts: { test: 'vitest run', build: 'tsc' } }),
    )
  })

  afterEach(() => {
    rmSync(workspacePath, { recursive: true, force: true })
  })

  it('marks acquisition failure honestly instead of running portability on a missing workspace', async () => {
    const profile = await buildRepositoryIntakeProfile({
      target: target(),
      acquisition: acquisition({ acquired: false, error: 'clone failed' }),
      policy: createGitHubOperationsPolicy(),
    })
    expect(profile.acquired).toBe(false)
    expect(profile.riskFlags).toContain('acquisition-failed')
    expect(profile.portability).toBeUndefined()
  })

  it('runs Bundle 7 portability discovery against the acquired workspace', async () => {
    const profile = await buildRepositoryIntakeProfile({
      target: target(),
      acquisition: acquisition({ workspacePath }),
      policy: createGitHubOperationsPolicy(),
    })
    expect(profile.acquired).toBe(true)
    expect(profile.portability).toBeDefined()
    expect(profile.portability?.ecosystems).toContain('node')
    expect(profile.portability?.validationCommands.length).toBeGreaterThan(0)
    expect(profile.packageRoots).toEqual(['.'])
  })

  it('flags a repository with no discovered validation commands', async () => {
    const emptyWorkspace = mkdtempSync(join(tmpdir(), 'symbolwright-intake-empty-'))
    try {
      const profile = await buildRepositoryIntakeProfile({
        target: target(),
        acquisition: acquisition({ workspacePath: emptyWorkspace }),
        policy: createGitHubOperationsPolicy(),
      })
      expect(profile.riskFlags).toContain('no-validation-commands-discovered')
    } finally {
      rmSync(emptyWorkspace, { recursive: true, force: true })
    }
  })

  it('flags metadata-derived risks without fabricating metadata when none is supplied', async () => {
    const withoutMetadata = await buildRepositoryIntakeProfile({
      target: target(),
      acquisition: acquisition({ workspacePath }),
      policy: createGitHubOperationsPolicy(),
    })
    expect(withoutMetadata.metadata).toBeUndefined()
    expect(withoutMetadata.riskFlags).not.toContain('repository-is-a-fork')

    const withMetadata = await buildRepositoryIntakeProfile({
      target: target(),
      acquisition: acquisition({ workspacePath }),
      policy: createGitHubOperationsPolicy(),
      metadata: { defaultBranch: 'main', isFork: true, isPrivate: false, archived: false },
    })
    expect(withMetadata.metadata?.isFork).toBe(true)
    expect(withMetadata.riskFlags).toContain('repository-is-a-fork')
  })

  it('flags an archived or private repository independently of fork status', async () => {
    const archived = await buildRepositoryIntakeProfile({
      target: target(),
      acquisition: acquisition({ workspacePath }),
      policy: createGitHubOperationsPolicy(),
      metadata: { defaultBranch: 'main', isFork: false, isPrivate: false, archived: true },
    })
    expect(archived.riskFlags).toContain('repository-is-archived')
    expect(archived.riskFlags).not.toContain('repository-is-a-fork')

    const privateRepo = await buildRepositoryIntakeProfile({
      target: target(),
      acquisition: acquisition({ workspacePath }),
      policy: createGitHubOperationsPolicy(),
      metadata: { defaultBranch: 'main', isFork: false, isPrivate: true, archived: false },
    })
    expect(privateRepo.riskFlags).toContain('repository-is-private')
  })

  it('reports write and PR-creation flags from the policy, never assuming they are allowed', async () => {
    const restricted = await buildRepositoryIntakeProfile({
      target: target(),
      acquisition: acquisition({ workspacePath }),
      policy: createGitHubOperationsPolicy(),
    })
    expect(restricted.writesAllowed).toBe(false)
    expect(restricted.pullRequestCreationAllowed).toBe(false)

    const permissive = await buildRepositoryIntakeProfile({
      target: target(),
      acquisition: acquisition({ workspacePath }),
      policy: createGitHubOperationsPolicy({
        enabledOperations: ['push_branch', 'open_pull_request'],
      }),
    })
    expect(permissive.writesAllowed).toBe(true)
    expect(permissive.pullRequestCreationAllowed).toBe(true)
  })

  it('marks local-duplicate origin distinctly from external-clone origin', async () => {
    const profile = await buildRepositoryIntakeProfile({
      target: target(),
      acquisition: acquisition({ workspacePath, strategy: 'duplicate-local' }),
      policy: createGitHubOperationsPolicy(),
    })
    expect(profile.origin).toBe('local-duplicate')
  })

  it('renders a report including ecosystem, validation commands, and risk flags', async () => {
    const profile = await buildRepositoryIntakeProfile({
      target: target(),
      acquisition: acquisition({ workspacePath }),
      policy: createGitHubOperationsPolicy(),
    })
    const rendered = renderRepositoryIntakeProfile(profile)
    expect(rendered).toContain('node')
    expect(rendered).toContain('Validation commands:')
    expect(rendered).toContain('Write operations allowed: no')
  })

  it('renders resolved ref, metadata, CI workflow evidence, and risk flags when present', async () => {
    const ciWorkspace = mkdtempSync(join(tmpdir(), 'symbolwright-intake-ci-'))
    try {
      writeFileSync(
        join(ciWorkspace, 'package.json'),
        JSON.stringify({ name: 'x', scripts: { test: 'vitest run' } }),
      )
      const workflowsDir = join(ciWorkspace, '.github', 'workflows')
      mkdirSync(workflowsDir, { recursive: true })
      writeFileSync(
        join(workflowsDir, 'ci.yml'),
        'jobs:\n  test:\n    steps:\n      - name: Test\n        run: npm test\n',
      )

      const profile = await buildRepositoryIntakeProfile({
        target: target(),
        acquisition: acquisition({ workspacePath: ciWorkspace, checkedOutRef: 'feature' }),
        policy: createGitHubOperationsPolicy(),
        metadata: { defaultBranch: 'main', isFork: true, isPrivate: true, archived: true },
      })
      const rendered = renderRepositoryIntakeProfile(profile)
      expect(rendered).toContain('Resolved ref: feature')
      expect(rendered).toContain('Fork: yes')
      expect(rendered).toContain('Private: yes')
      expect(rendered).toContain('Archived: yes')
      expect(rendered).toContain('CI workflow evidence:')
      expect(rendered).toContain('Risk flags:')
      expect(rendered).toContain('repository-is-a-fork')
    } finally {
      rmSync(ciWorkspace, { recursive: true, force: true })
    }
  })

  it('renders a failed-acquisition profile without a portability section', async () => {
    const profile = await buildRepositoryIntakeProfile({
      target: target(),
      acquisition: acquisition({ acquired: false, error: 'clone failed' }),
      policy: createGitHubOperationsPolicy(),
    })
    const rendered = renderRepositoryIntakeProfile(profile)
    expect(rendered).toContain('Acquired: no')
    expect(rendered).not.toContain('Ecosystems:')
    expect(rendered).toContain('acquisition-failed')
  })
})
