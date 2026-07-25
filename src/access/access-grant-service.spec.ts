import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { AccessStore } from './access-store.js'
import {
  AccessGrantService,
  GrantValidationError,
  InvalidCredentialError,
  SessionLimitExceededError,
  StepUpRequiredError,
} from './access-grant-service.js'
import { AuthorizationService } from './authorization-service.js'
import type { RepositoryScope } from './access-types.js'

const REPO_SCOPE: RepositoryScope = {
  mode: 'single',
  repositories: ['JLPARTIN/SymbolWright'],
  organizations: [],
}

describe('AccessGrantService + AuthorizationService', () => {
  let root: string
  let store: AccessStore
  let grants: AccessGrantService
  let authz: AuthorizationService

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'symbolwright-access-'))
    store = new AccessStore({ workspaceRoot: root })
    grants = new AccessGrantService(store)
    authz = new AuthorizationService(store)
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  it('creates a Coding Agent grant that can read, write on agent branches, and push, but not merge', async () => {
    const { grant, plaintextToken } = grants.createGrant({
      principalType: 'coding-agent',
      displayName: 'Claude Code',
      issuedBy: 'operator-1',
      profileId: 'coding-agent',
      repositoryScope: REPO_SCOPE,
    })
    expect(plaintextToken).toBeDefined()
    expect(grant.status).toBe('active')
    expect(grant.githubCapabilities).not.toContain('repo.pull_request.merge')

    const readDecision = await authz.evaluate({
      principalId: grant.principalId,
      grantId: grant.id,
      capability: 'repo.content.read',
      repository: 'JLPARTIN/SymbolWright',
    })
    expect(readDecision.allowed).toBe(true)

    const writeDecision = await authz.evaluate({
      principalId: grant.principalId,
      grantId: grant.id,
      capability: 'repo.content.update',
      repository: 'JLPARTIN/SymbolWright',
      branch: 'symbolwright/agent/fix-1',
    })
    expect(writeDecision.allowed).toBe(true)

    const protectedBranchDecision = await authz.evaluate({
      principalId: grant.principalId,
      grantId: grant.id,
      capability: 'repo.content.update',
      repository: 'JLPARTIN/SymbolWright',
      branch: 'main',
    })
    expect(protectedBranchDecision.allowed).toBe(false)
    expect(protectedBranchDecision.reasonCode).toBe('BRANCH_PROTECTED')

    const outOfPatternBranch = await authz.evaluate({
      principalId: grant.principalId,
      grantId: grant.id,
      capability: 'repo.content.update',
      repository: 'JLPARTIN/SymbolWright',
      branch: 'random-branch',
    })
    expect(outOfPatternBranch.allowed).toBe(false)
    expect(outOfPatternBranch.reasonCode).toBe('BRANCH_OUT_OF_SCOPE')

    const mergeDecision = await authz.evaluate({
      principalId: grant.principalId,
      grantId: grant.id,
      capability: 'repo.pull_request.merge',
    })
    expect(mergeDecision.allowed).toBe(false)
    expect(['CAPABILITY_NOT_GRANTED', 'CAPABILITY_DENIED']).toContain(mergeDecision.reasonCode)
  })

  it('denies a repository outside the grant scope (no inference from visibility)', async () => {
    const { grant } = grants.createGrant({
      principalType: 'coding-agent',
      displayName: 'Scoped Agent',
      issuedBy: 'operator-1',
      profileId: 'coding-agent',
      repositoryScope: REPO_SCOPE,
    })

    const decision = await authz.evaluate({
      principalId: grant.principalId,
      grantId: grant.id,
      capability: 'repo.content.read',
      repository: 'someone-else/other-repo',
    })
    expect(decision.allowed).toBe(false)
    expect(decision.reasonCode).toBe('REPOSITORY_OUT_OF_SCOPE')
  })

  it('never grants a high-risk capability through the Repository Analyst or Coding Agent profiles', () => {
    const analyst = grants.createGrant({
      principalType: 'llm',
      displayName: 'Analyst',
      issuedBy: 'operator-1',
      profileId: 'repository-analyst',
      repositoryScope: REPO_SCOPE,
      additionalGithubCapabilities: ['repo.secrets.manage'],
    })
    expect(analyst.grant.githubCapabilities).not.toContain('repo.secrets.manage')
    expect(analyst.grant.deniedCapabilities).not.toContain('repo.secrets.manage')

    const coder = grants.createGrant({
      principalType: 'coding-agent',
      displayName: 'Coder',
      issuedBy: 'operator-1',
      profileId: 'coding-agent',
      repositoryScope: REPO_SCOPE,
      additionalGithubCapabilities: ['repo.repository.delete'],
    })
    expect(coder.grant.githubCapabilities).not.toContain('repo.repository.delete')
    expect(coder.grant.deniedCapabilities).toContain('repo.repository.delete')
  })

  it('never adds a high-risk capability except through explicitHighRiskCapabilities with step-up', () => {
    expect(() =>
      grants.createGrant({
        principalType: 'human',
        displayName: 'Custom',
        issuedBy: 'operator-1',
        profileId: 'custom',
        repositoryScope: REPO_SCOPE,
        explicitHighRiskCapabilities: ['repo.secrets.manage'],
      }),
    ).toThrow(StepUpRequiredError)

    const created = grants.createGrant({
      principalType: 'human',
      displayName: 'Custom',
      issuedBy: 'operator-1',
      profileId: 'custom',
      repositoryScope: REPO_SCOPE,
      additionalGithubCapabilities: ['repo.secrets.manage', 'repo.content.read'],
      explicitHighRiskCapabilities: ['repo.secrets.manage'],
      stepUpConfirmed: true,
      reason: 'Rotating a leaked secret',
    })
    expect(created.grant.githubCapabilities).toContain('repo.secrets.manage')
    expect(created.grant.githubCapabilities).toContain('repo.content.read')

    const withoutExplicitSelection = grants.createGrant({
      principalType: 'human',
      displayName: 'Custom2',
      issuedBy: 'operator-1',
      profileId: 'custom',
      repositoryScope: REPO_SCOPE,
      additionalGithubCapabilities: ['repo.secrets.manage', 'repo.content.read'],
    })
    expect(withoutExplicitSelection.grant.githubCapabilities).not.toContain('repo.secrets.manage')
    expect(withoutExplicitSelection.grant.githubCapabilities).toContain('repo.content.read')
  })

  it('requires step-up confirmation and a reason for the Temporary Administrator profile', () => {
    expect(() =>
      grants.createGrant({
        principalType: 'human',
        displayName: 'Break-glass',
        issuedBy: 'operator-1',
        profileId: 'temporary-administrator',
        repositoryScope: REPO_SCOPE,
      }),
    ).toThrow(StepUpRequiredError)

    const created = grants.createGrant({
      principalType: 'human',
      displayName: 'Break-glass',
      issuedBy: 'operator-1',
      profileId: 'temporary-administrator',
      repositoryScope: REPO_SCOPE,
      stepUpConfirmed: true,
      reason: 'Incident response IR-42',
    })
    // Default lifetime for Temporary Administrator is clamped to one hour regardless of request.
    const hours =
      (new Date(created.grant.expiresAt).getTime() - new Date(created.grant.startsAt).getTime()) /
      3_600_000
    expect(hours).toBeLessThanOrEqual(1)
  })

  it('only includes repo.pull_request.merge when enableMerge is explicitly true, even for Maintainer Agent', () => {
    const withoutMerge = grants.createGrant({
      principalType: 'automation',
      displayName: 'Maintainer',
      issuedBy: 'operator-1',
      profileId: 'maintainer-agent',
      repositoryScope: REPO_SCOPE,
    })
    expect(withoutMerge.grant.githubCapabilities).not.toContain('repo.pull_request.merge')

    const withMerge = grants.createGrant({
      principalType: 'automation',
      displayName: 'Maintainer',
      issuedBy: 'operator-1',
      profileId: 'maintainer-agent',
      repositoryScope: REPO_SCOPE,
      enableMerge: true,
    })
    expect(withMerge.grant.githubCapabilities).toContain('repo.pull_request.merge')
  })

  it('requires operator approval before merge for the Maintainer Agent profile, and does not replay it', async () => {
    const { grant } = grants.createGrant({
      principalType: 'automation',
      displayName: 'Maintainer',
      issuedBy: 'operator-1',
      profileId: 'maintainer-agent',
      repositoryScope: REPO_SCOPE,
      enableMerge: true,
    })

    const first = await authz.evaluate({
      principalId: grant.principalId,
      grantId: grant.id,
      capability: 'repo.pull_request.merge',
      repository: 'JLPARTIN/SymbolWright',
      missionId: 'mission-1',
    })
    expect(first.allowed).toBe(false)
    expect(first.requiresApproval).toBe(true)
    expect(first.approvalId).toBeDefined()

    const approval = store.readApproval(first.approvalId as string)
    expect(approval).toBeDefined()
    store.writeApproval({ ...approval!, status: 'approved', approverId: 'operator-1' })

    const second = await authz.evaluate({
      principalId: grant.principalId,
      grantId: grant.id,
      capability: 'repo.pull_request.merge',
      repository: 'JLPARTIN/SymbolWright',
      missionId: 'mission-1',
    })
    expect(second.allowed).toBe(true)

    // The same bound approval cannot be replayed for a second, otherwise-identical operation.
    const third = await authz.evaluate({
      principalId: grant.principalId,
      grantId: grant.id,
      capability: 'repo.pull_request.merge',
      repository: 'JLPARTIN/SymbolWright',
      missionId: 'mission-1',
    })
    expect(third.allowed).toBe(false)
    expect(third.requiresApproval).toBe(true)
  })

  it('authenticates a valid agent token and rejects a tampered or unrelated one', () => {
    const { grant, plaintextToken } = grants.createGrant({
      principalType: 'coding-agent',
      displayName: 'Coder',
      issuedBy: 'operator-1',
      profileId: 'coding-agent',
      repositoryScope: REPO_SCOPE,
    })
    const result = grants.authenticateAgentToken(plaintextToken as string)
    expect(result.grant.id).toBe(grant.id)
    expect(result.session.grantId).toBe(grant.id)

    expect(() => grants.authenticateAgentToken(`${plaintextToken}tampered`)).toThrow(
      InvalidCredentialError,
    )
    expect(() => grants.authenticateAgentToken('sw_agent_unknown.secret')).toThrow(
      InvalidCredentialError,
    )
  })

  it('immediately invalidates a session when the grant is paused, and restores it on resume', async () => {
    const { grant, plaintextToken } = grants.createGrant({
      principalType: 'coding-agent',
      displayName: 'Coder',
      issuedBy: 'operator-1',
      profileId: 'coding-agent',
      repositoryScope: REPO_SCOPE,
    })
    grants.authenticateAgentToken(plaintextToken as string)

    grants.pauseGrant(grant.id, 'operator-1')
    expect(() => grants.authenticateAgentToken(plaintextToken as string)).toThrow(
      InvalidCredentialError,
    )

    const readWhilePaused = await authz.evaluate({
      principalId: grant.principalId,
      grantId: grant.id,
      capability: 'repo.content.read',
    })
    expect(readWhilePaused.allowed).toBe(false)
    expect(readWhilePaused.reasonCode).toBe('GRANT_PAUSED')

    grants.resumeGrant(grant.id, 'operator-1')
    const authenticated = grants.authenticateAgentToken(plaintextToken as string)
    expect(authenticated.grant.status).toBe('active')
  })

  it('immediately and permanently invalidates every credential and session on revoke', () => {
    const { grant, plaintextToken } = grants.createGrant({
      principalType: 'coding-agent',
      displayName: 'Coder',
      issuedBy: 'operator-1',
      profileId: 'coding-agent',
      repositoryScope: REPO_SCOPE,
    })
    grants.authenticateAgentToken(plaintextToken as string)
    grants.revokeGrant(grant.id, 'operator-1', 'compromised')

    expect(() => grants.authenticateAgentToken(plaintextToken as string)).toThrow(
      InvalidCredentialError,
    )
    // Revocation is permanent — unlike pause, a revoked grant cannot be resumed.
    expect(() => grants.resumeGrant(grant.id, 'operator-1')).toThrow(GrantValidationError)
  })

  it('rotating a credential invalidates the old token and issues a working new one', () => {
    const { grant, plaintextToken } = grants.createGrant({
      principalType: 'coding-agent',
      displayName: 'Coder',
      issuedBy: 'operator-1',
      profileId: 'coding-agent',
      repositoryScope: REPO_SCOPE,
    })
    const rotated = grants.rotateCredential(grant.id)
    expect(rotated.token).not.toBe(plaintextToken)

    expect(() => grants.authenticateAgentToken(plaintextToken as string)).toThrow(
      InvalidCredentialError,
    )
    const authenticated = grants.authenticateAgentToken(rotated.token)
    expect(authenticated.grant.id).toBe(grant.id)
  })

  it('enforces maxConcurrentSessions across distinct credentials on one grant', () => {
    const { grant } = grants.createGrant({
      principalType: 'coding-agent',
      displayName: 'Coder',
      issuedBy: 'operator-1',
      profileId: 'coding-agent',
      repositoryScope: REPO_SCOPE,
      sessionLimits: { maxConcurrentSessions: 1 },
      issueTokenNow: false,
    })
    const first = grants.issueCredential(grant.id, 'manual-token')
    const second = grants.issueCredential(grant.id, 'manual-token')

    grants.authenticateAgentToken(first.token)
    expect(() => grants.authenticateAgentToken(second.token)).toThrow(SessionLimitExceededError)
  })

  it('cannot resume an already-expired grant', () => {
    const { grant } = grants.createGrant({
      principalType: 'coding-agent',
      displayName: 'Coder',
      issuedBy: 'operator-1',
      profileId: 'coding-agent',
      repositoryScope: REPO_SCOPE,
      expiresInHours: 1,
    })
    // Simulate expiry by writing the grant back with a past expiresAt.
    store.writeGrant({ ...grant, expiresAt: new Date(Date.now() - 1000).toISOString() })
    grants.pauseGrant(grant.id, 'operator-1')
    expect(() => grants.resumeGrant(grant.id, 'operator-1')).toThrow(GrantValidationError)
  })

  it('fails closed for an unknown capability', async () => {
    const { grant } = grants.createGrant({
      principalType: 'coding-agent',
      displayName: 'Coder',
      issuedBy: 'operator-1',
      profileId: 'coding-agent',
      repositoryScope: REPO_SCOPE,
    })
    const decision = await authz.evaluate({
      principalId: grant.principalId,
      grantId: grant.id,
      capability: 'not.a.real.capability',
    })
    expect(decision.allowed).toBe(false)
    expect(decision.reasonCode).toBe('UNKNOWN_CAPABILITY')
  })

  it('supports organization, installation, and discovery repository-scope modes', async () => {
    const org = grants.createGrant({
      principalType: 'coding-agent',
      displayName: 'Org-scoped',
      issuedBy: 'operator-1',
      profileId: 'coding-agent',
      repositoryScope: { mode: 'organization', repositories: [], organizations: ['JLPARTIN'] },
    })
    const inOrg = await authz.evaluate({
      principalId: org.grant.principalId,
      grantId: org.grant.id,
      capability: 'repo.content.read',
      repository: 'JLPARTIN/AnyRepo',
    })
    expect(inOrg.allowed).toBe(true)
    const outOfOrg = await authz.evaluate({
      principalId: org.grant.principalId,
      grantId: org.grant.id,
      capability: 'repo.content.read',
      repository: 'other-org/repo',
    })
    expect(outOfOrg.allowed).toBe(false)
    expect(outOfOrg.reasonCode).toBe('REPOSITORY_OUT_OF_SCOPE')

    const installation = grants.createGrant({
      principalType: 'coding-agent',
      displayName: 'Installation-scoped',
      issuedBy: 'operator-1',
      profileId: 'coding-agent',
      repositoryScope: { mode: 'installation', repositories: [], organizations: [] },
    })
    const installationDecision = await authz.evaluate({
      principalId: installation.grant.principalId,
      grantId: installation.grant.id,
      capability: 'repo.content.read',
      repository: 'anything/goes',
    })
    expect(installationDecision.allowed).toBe(true)

    const discovery = grants.createGrant({
      principalType: 'coding-agent',
      displayName: 'Discovery-scoped',
      issuedBy: 'operator-1',
      profileId: 'coding-agent',
      repositoryScope: {
        mode: 'discovery',
        repositories: [],
        organizations: [],
        activatedRepositories: ['JLPARTIN/SymbolWright'],
      },
    })
    const activated = await authz.evaluate({
      principalId: discovery.grant.principalId,
      grantId: discovery.grant.id,
      capability: 'repo.content.read',
      repository: 'JLPARTIN/SymbolWright',
    })
    expect(activated.allowed).toBe(true)
    const notActivated = await authz.evaluate({
      principalId: discovery.grant.principalId,
      grantId: discovery.grant.id,
      capability: 'repo.content.read',
      repository: 'JLPARTIN/OtherRepo',
    })
    expect(notActivated.allowed).toBe(false)
  })

  it('denies the default branch when defaultBranchMutationAllowed is not set, even matching an allowed pattern', async () => {
    const { grant } = grants.createGrant({
      principalType: 'coding-agent',
      displayName: 'Coder',
      issuedBy: 'operator-1',
      profileId: 'coding-agent',
      repositoryScope: REPO_SCOPE,
      branchScope: { allowedPatterns: ['main'], deniedPatterns: [] },
    })
    const decision = await authz.evaluate({
      principalId: grant.principalId,
      grantId: grant.id,
      capability: 'repo.content.update',
      branch: 'main',
      isDefaultBranch: true,
    })
    expect(decision.allowed).toBe(false)
    expect(decision.reasonCode).toBe('DEFAULT_BRANCH_PROTECTED')
  })

  it('rejects an unknown permission profile id', () => {
    expect(() =>
      grants.createGrant({
        principalType: 'coding-agent',
        displayName: 'Bad',
        issuedBy: 'operator-1',
        profileId: 'not-a-real-profile',
        repositoryScope: REPO_SCOPE,
      }),
    ).toThrow(GrantValidationError)
  })

  it('deleteGrant removes the grant and revokes its sessions', () => {
    const { grant, plaintextToken } = grants.createGrant({
      principalType: 'coding-agent',
      displayName: 'Coder',
      issuedBy: 'operator-1',
      profileId: 'coding-agent',
      repositoryScope: REPO_SCOPE,
    })
    grants.authenticateAgentToken(plaintextToken as string)
    grants.deleteGrant(grant.id)
    expect(grants.getGrant(grant.id)).toBeUndefined()
    expect(() => grants.authenticateAgentToken(plaintextToken as string)).toThrow(
      InvalidCredentialError,
    )
  })

  it('rejects a credential presented against the wrong principal id (forged principal guard)', async () => {
    const { grant } = grants.createGrant({
      principalType: 'coding-agent',
      displayName: 'Coder',
      issuedBy: 'operator-1',
      profileId: 'coding-agent',
      repositoryScope: REPO_SCOPE,
    })
    const decision = await authz.evaluate({
      principalId: 'someone-elses-principal-id',
      grantId: grant.id,
      capability: 'repo.content.read',
    })
    expect(decision.allowed).toBe(false)
    expect(decision.reasonCode).toBe('PRINCIPAL_MISMATCH')
  })
})
