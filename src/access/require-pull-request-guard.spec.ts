import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { AccessRuntime } from './access-runtime.js'
import { checkRequirePullRequest } from './require-pull-request-guard.js'
import type { RepositoryScope } from './access-types.js'

const REPO_SCOPE: RepositoryScope = {
  mode: 'single',
  repositories: ['JLPARTIN/SymbolWright'],
  organizations: [],
}

describe('checkRequirePullRequest', () => {
  let root: string
  let accessRuntime: AccessRuntime

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'symbolwright-require-pr-guard-'))
    accessRuntime = new AccessRuntime({ workspaceRoot: root })
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  it('is unmet when the grant requires a pull request and none has been recorded', () => {
    const { grant } = accessRuntime.grantService.createGrant({
      principalType: 'coding-agent',
      displayName: 'Coder',
      issuedBy: 'operator-1',
      profileId: 'coding-agent',
      repositoryScope: REPO_SCOPE,
      executionLimits: { requirePullRequest: true },
    })
    const result = checkRequirePullRequest(accessRuntime, grant.id, [])
    expect(result).toEqual({ grantId: grant.id })
  })

  it('is satisfied once a pull request has been recorded', () => {
    const { grant } = accessRuntime.grantService.createGrant({
      principalType: 'coding-agent',
      displayName: 'Coder',
      issuedBy: 'operator-1',
      profileId: 'coding-agent',
      repositoryScope: REPO_SCOPE,
      executionLimits: { requirePullRequest: true },
    })
    const result = checkRequirePullRequest(accessRuntime, grant.id, [
      'https://github.com/acme/widgets/pull/1',
    ])
    expect(result).toBeUndefined()
  })

  it('is a no-op when the grant does not require a pull request', () => {
    const { grant } = accessRuntime.grantService.createGrant({
      principalType: 'coding-agent',
      displayName: 'Coder',
      issuedBy: 'operator-1',
      profileId: 'coding-agent',
      repositoryScope: REPO_SCOPE,
      executionLimits: { requirePullRequest: false },
    })
    const result = checkRequirePullRequest(accessRuntime, grant.id, [])
    expect(result).toBeUndefined()
  })

  it('is a no-op for an unknown grant id', () => {
    const result = checkRequirePullRequest(accessRuntime, 'grant_does-not-exist', [])
    expect(result).toBeUndefined()
  })
})
