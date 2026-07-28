import {
  LEGACY_SANDBOX_EXECUTE_CAPABILITY,
  SANDBOX_DEPENDENCY_ACQUIRE_CAPABILITY,
  SANDBOX_EGRESS_CAPABILITY,
  SANDBOX_OFFLINE_EXECUTE_CAPABILITY,
} from './sandbox-capabilities.js'
import {
  DEFAULT_ALLOWED_BRANCH_PATTERNS,
  DEFAULT_DENIED_BRANCH_PATTERNS,
  type ApprovalPolicy,
  type BranchScope,
  type MissionExecutionLimits,
} from './access-types.js'

export interface PermissionProfile {
  readonly id: string
  readonly displayName: string
  readonly description: string
  readonly symbolWrightCapabilities: readonly string[]
  readonly githubCapabilities: readonly string[]
  /** Capabilities explicitly and permanently excluded from this profile, even under a custom edit. */
  readonly hardDenied: readonly string[]
  readonly defaultBranchScope: BranchScope
  readonly defaultApprovalPolicy: ApprovalPolicy
  readonly defaultExecutionLimits: MissionExecutionLimits
  readonly defaultExpiryHours: number
  readonly maxExpiryHours: number
  readonly recommended: boolean
  readonly requiresStepUp: boolean
}

const STANDARD_BRANCH_SCOPE: BranchScope = {
  allowedPatterns: DEFAULT_ALLOWED_BRANCH_PATTERNS,
  deniedPatterns: DEFAULT_DENIED_BRANCH_PATTERNS,
  defaultBranchReadOnly: true,
  defaultBranchMutationAllowed: false,
}

const READ_ONLY_BRANCH_SCOPE: BranchScope = {
  allowedPatterns: [],
  deniedPatterns: DEFAULT_DENIED_BRANCH_PATTERNS,
  defaultBranchReadOnly: true,
  defaultBranchMutationAllowed: false,
}

export const REPOSITORY_ANALYST_PROFILE: PermissionProfile = {
  id: 'repository-analyst',
  displayName: 'Repository Analyst',
  description:
    'Inspects repositories, builds semantic indexes, reads issues/PRs/checks/logs, and generates plans and recommendations. Cannot write.',
  symbolWrightCapabilities: [
    'symbolwright.repository.index',
    'symbolwright.repository.analyze',
    'symbolwright.repository.search',
    'symbolwright.plan.create',
    'symbolwright.mission.read',
  ],
  githubCapabilities: [
    'repo.metadata.read',
    'repo.content.read',
    'repo.history.read',
    'repo.branches.read',
    'repo.tags.read',
    'repo.issues.read',
    'repo.pull_requests.read',
    'repo.checks.read',
    'repo.workflows.read',
    'repo.security_alerts.read',
    'repo.actions.logs.read',
    'repo.actions.artifacts.read',
    'repo.pull_request.comment',
  ],
  hardDenied: [
    'repo.content.create',
    'repo.content.update',
    'repo.content.delete',
    'repo.commit.create',
    'repo.commit.push',
    'repo.branch.create',
    'repo.pull_request.create',
    'symbolwright.mission.execute',
    LEGACY_SANDBOX_EXECUTE_CAPABILITY,
    SANDBOX_OFFLINE_EXECUTE_CAPABILITY,
    SANDBOX_DEPENDENCY_ACQUIRE_CAPABILITY,
    SANDBOX_EGRESS_CAPABILITY,
  ],
  defaultBranchScope: READ_ONLY_BRANCH_SCOPE,
  defaultApprovalPolicy: { rules: [{ match: '*', requirement: 'none' }] },
  defaultExecutionLimits: { requirePullRequest: true, allowDirectPush: false },
  defaultExpiryHours: 24 * 7,
  maxExpiryHours: 24 * 30,
  recommended: false,
  requiresStepUp: false,
}

export const CODING_AGENT_PROFILE: PermissionProfile = {
  id: 'coding-agent',
  displayName: 'Coding Agent',
  description:
    'Reads and analyzes approved repositories, creates missions and branches, edits files, validates in the sandbox, commits, pushes, opens/updates pull requests, and responds to review feedback and CI failures. Cannot merge, change settings, touch secrets, or mutate protected branches.',
  symbolWrightCapabilities: [
    'symbolwright.repository.index',
    'symbolwright.repository.analyze',
    'symbolwright.repository.search',
    'symbolwright.plan.create',
    'symbolwright.mission.create',
    'symbolwright.mission.read',
    'symbolwright.mission.execute',
    'symbolwright.mission.cancel',
    'symbolwright.validation.run',
    'symbolwright.repair.run',
    SANDBOX_OFFLINE_EXECUTE_CAPABILITY,
    'symbolwright.checkpoint.create',
    'symbolwright.checkpoint.restore',
  ],
  githubCapabilities: [
    'repo.metadata.read',
    'repo.content.read',
    'repo.history.read',
    'repo.branches.read',
    'repo.tags.read',
    'repo.issues.read',
    'repo.pull_requests.read',
    'repo.checks.read',
    'repo.workflows.read',
    'repo.security_alerts.read',
    'repo.actions.logs.read',
    'repo.actions.artifacts.read',
    'repo.branch.create',
    'repo.content.create',
    'repo.content.update',
    'repo.content.delete',
    'repo.commit.create',
    'repo.commit.push',
    'repo.pull_request.create',
    'repo.pull_request.update',
    'repo.pull_request.comment',
    'repo.review.respond',
    'repo.checks.rerun',
    'repo.workflow.rerun',
  ],
  hardDenied: [
    'repo.pull_request.merge',
    'repo.branch.protection.update',
    'repo.settings.update',
    'repo.collaborators.manage',
    'repo.webhooks.manage',
    'repo.secrets.manage',
    'repo.variables.manage',
    'repo.deployments.manage',
    'repo.environments.manage',
    'repo.repository.delete',
    'repo.organization.manage',
    'repo.branch.delete',
    'repo.branch.update',
    SANDBOX_DEPENDENCY_ACQUIRE_CAPABILITY,
    SANDBOX_EGRESS_CAPABILITY,
  ],
  defaultBranchScope: STANDARD_BRANCH_SCOPE,
  defaultApprovalPolicy: {
    rules: [
      { match: 'symbolwright.mission.execute', requirement: 'before-first-write' },
      { match: 'repo.commit.push', requirement: 'none' },
      { match: 'repo.pull_request.create', requirement: 'none' },
      { match: 'repo.pull_request.merge', requirement: 'denied' },
      { match: 'high-risk', requirement: 'denied' },
      { match: '*', requirement: 'none' },
    ],
  },
  defaultExecutionLimits: {
    maxConcurrentMissions: 2,
    maxRepairAttempts: 3,
    requirePullRequest: true,
    allowDirectPush: true,
    sandboxNetworkAccess: false,
  },
  defaultExpiryHours: 24,
  maxExpiryHours: 24 * 14,
  recommended: true,
  requiresStepUp: false,
}

export const MAINTAINER_AGENT_PROFILE: PermissionProfile = {
  id: 'maintainer-agent',
  displayName: 'Maintainer Agent',
  description:
    'Everything the Coding Agent profile allows, plus rerunning/dispatching approved workflows, updating issues/labels, managing draft/ready-for-review PR state, and — only when the grant and approval policy both allow it — merging pull requests.',
  symbolWrightCapabilities: CODING_AGENT_PROFILE.symbolWrightCapabilities,
  githubCapabilities: [
    ...CODING_AGENT_PROFILE.githubCapabilities,
    'repo.issue.create',
    'repo.issue.update',
    'repo.workflow.dispatch',
    'repo.pull_request.merge',
  ],
  hardDenied: [
    'repo.branch.protection.update',
    'repo.settings.update',
    'repo.collaborators.manage',
    'repo.webhooks.manage',
    'repo.secrets.manage',
    'repo.variables.manage',
    'repo.deployments.manage',
    'repo.environments.manage',
    'repo.repository.delete',
    'repo.organization.manage',
    SANDBOX_DEPENDENCY_ACQUIRE_CAPABILITY,
    SANDBOX_EGRESS_CAPABILITY,
  ],
  defaultBranchScope: STANDARD_BRANCH_SCOPE,
  defaultApprovalPolicy: {
    rules: [
      { match: 'symbolwright.mission.execute', requirement: 'before-first-write' },
      { match: 'repo.pull_request.merge', requirement: 'before-merge' },
      { match: 'high-risk', requirement: 'every-high-risk-operation' },
      { match: '*', requirement: 'none' },
    ],
  },
  defaultExecutionLimits: {
    maxConcurrentMissions: 3,
    maxRepairAttempts: 3,
    requirePullRequest: false,
    allowDirectPush: true,
    sandboxNetworkAccess: false,
  },
  defaultExpiryHours: 24,
  maxExpiryHours: 24 * 7,
  recommended: false,
  requiresStepUp: false,
}

export const TEMPORARY_ADMINISTRATOR_PROFILE: PermissionProfile = {
  id: 'temporary-administrator',
  displayName: 'Temporary Administrator',
  description:
    'May receive individually selected high-risk capabilities for a short, explicit window. Requires step-up confirmation, a mandatory reason, and a maximum default lifetime of one hour. Never the default or recommended profile.',
  symbolWrightCapabilities: CODING_AGENT_PROFILE.symbolWrightCapabilities,
  githubCapabilities: CODING_AGENT_PROFILE.githubCapabilities,
  hardDenied: ['repo.repository.delete', 'repo.organization.manage'],
  defaultBranchScope: STANDARD_BRANCH_SCOPE,
  defaultApprovalPolicy: {
    rules: [
      { match: 'high-risk', requirement: 'every-high-risk-operation' },
      { match: '*', requirement: 'none' },
    ],
  },
  defaultExecutionLimits: {
    maxConcurrentMissions: 1,
    maxRepairAttempts: 3,
    requirePullRequest: false,
    allowDirectPush: true,
  },
  defaultExpiryHours: 1,
  maxExpiryHours: 1,
  recommended: false,
  requiresStepUp: true,
}

export const CUSTOM_PROFILE: PermissionProfile = {
  id: 'custom',
  displayName: 'Custom',
  description:
    'Operator selects individual capabilities. High-risk capabilities still require explicit selection.',
  symbolWrightCapabilities: [],
  githubCapabilities: [],
  hardDenied: [],
  defaultBranchScope: STANDARD_BRANCH_SCOPE,
  defaultApprovalPolicy: {
    rules: [
      { match: 'high-risk', requirement: 'every-high-risk-operation' },
      { match: '*', requirement: 'before-first-write' },
    ],
  },
  defaultExecutionLimits: {},
  defaultExpiryHours: 24,
  maxExpiryHours: 24 * 30,
  recommended: false,
  requiresStepUp: false,
}

export const PERMISSION_PROFILES: readonly PermissionProfile[] = [
  REPOSITORY_ANALYST_PROFILE,
  CODING_AGENT_PROFILE,
  MAINTAINER_AGENT_PROFILE,
  TEMPORARY_ADMINISTRATOR_PROFILE,
  CUSTOM_PROFILE,
]

export const PERMISSION_PROFILE_CATALOG: ReadonlyMap<string, PermissionProfile> = new Map(
  PERMISSION_PROFILES.map((profile) => [profile.id, profile]),
)

export function getPermissionProfile(id: string): PermissionProfile | undefined {
  return PERMISSION_PROFILE_CATALOG.get(id)
}
