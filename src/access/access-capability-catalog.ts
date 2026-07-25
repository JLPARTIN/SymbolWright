import type { RiskLevel } from './access-types.js'

export type CapabilityCategory =
  | 'repo-read'
  | 'symbolwright-intelligence'
  | 'repo-mutation'
  | 'ci-workflow'
  | 'high-risk'
  | 'orchestration'

export interface CapabilityDescriptor {
  readonly id: string
  readonly category: CapabilityCategory
  readonly riskLevel: RiskLevel
  readonly description: string
  /** High-risk capabilities are never included by a wildcard/"full access" grant — always explicit. */
  readonly highRisk: boolean
}

function cap(
  id: string,
  category: CapabilityCategory,
  riskLevel: RiskLevel,
  description: string,
  highRisk = false,
): CapabilityDescriptor {
  return { id, category, riskLevel, description, highRisk }
}

const REPO_READ: readonly CapabilityDescriptor[] = [
  cap('repo.metadata.read', 'repo-read', 'read', 'Read repository metadata.'),
  cap('repo.content.read', 'repo-read', 'read', 'Read repository file content.'),
  cap('repo.history.read', 'repo-read', 'read', 'Read commit history.'),
  cap('repo.branches.read', 'repo-read', 'read', 'List and read branches.'),
  cap('repo.tags.read', 'repo-read', 'read', 'List and read tags.'),
  cap('repo.issues.read', 'repo-read', 'read', 'Read issues.'),
  cap('repo.pull_requests.read', 'repo-read', 'read', 'Read pull requests.'),
  cap('repo.checks.read', 'repo-read', 'read', 'Read CI check results.'),
  cap('repo.workflows.read', 'repo-read', 'read', 'Read workflow definitions/runs.'),
  cap('repo.security_alerts.read', 'repo-read', 'read', 'Read security alerts.'),
]

const SYMBOLWRIGHT_INTELLIGENCE: readonly CapabilityDescriptor[] = [
  cap(
    'symbolwright.repository.index',
    'symbolwright-intelligence',
    'low',
    'Build a semantic index.',
  ),
  cap(
    'symbolwright.repository.analyze',
    'symbolwright-intelligence',
    'low',
    'Analyze repository structure.',
  ),
  cap(
    'symbolwright.repository.search',
    'symbolwright-intelligence',
    'low',
    'Search repository content.',
  ),
  cap(
    'symbolwright.plan.create',
    'symbolwright-intelligence',
    'low',
    'Create an implementation plan.',
  ),
  cap(
    'symbolwright.mission.create',
    'symbolwright-intelligence',
    'low',
    'Create a SymbolWright mission.',
  ),
  cap(
    'symbolwright.mission.read',
    'symbolwright-intelligence',
    'read',
    'Read mission state and evidence.',
  ),
  cap(
    'symbolwright.mission.execute',
    'symbolwright-intelligence',
    'write',
    'Execute a mission (may mutate the workspace).',
  ),
  cap(
    'symbolwright.mission.cancel',
    'symbolwright-intelligence',
    'write',
    'Cancel a running mission.',
  ),
  cap(
    'symbolwright.validation.run',
    'symbolwright-intelligence',
    'low',
    'Run build/test/lint/type-check validation.',
  ),
  cap(
    'symbolwright.repair.run',
    'symbolwright-intelligence',
    'write',
    'Run the autonomous repair loop.',
  ),
  cap(
    'symbolwright.sandbox.execute',
    'symbolwright-intelligence',
    'low',
    'Execute code in the sandbox.',
  ),
  cap(
    'symbolwright.checkpoint.create',
    'symbolwright-intelligence',
    'low',
    'Create a checkpoint snapshot.',
  ),
  cap(
    'symbolwright.checkpoint.restore',
    'symbolwright-intelligence',
    'write',
    'Restore a checkpoint (mutates the workspace).',
  ),
]

/**
 * Multi-agent orchestration (`src/orchestration/`, Large PR Bundle #11): every collaborative-team
 * operation still authorizes through this same catalog and `AuthorizationService` — a team member
 * is only ever as powerful as its own grant's orchestration capabilities, never anything inherited
 * from the team it participates in.
 */
const ORCHESTRATION: readonly CapabilityDescriptor[] = [
  cap(
    'orchestration.team.read',
    'orchestration',
    'read',
    'Read agent-team, task, and event state.',
  ),
  cap(
    'orchestration.team.manage',
    'orchestration',
    'write',
    'Form, start, pause, resume, or cancel an agent team, and add/remove members.',
  ),
  cap(
    'orchestration.task.assign',
    'orchestration',
    'write',
    'Assign a collaborative task to an agent.',
  ),
  cap(
    'orchestration.candidate.submit',
    'orchestration',
    'write',
    'Submit an immutable change candidate from an isolated agent workspace.',
  ),
  cap(
    'orchestration.review.submit',
    'orchestration',
    'write',
    "Submit a peer review of another agent's change candidate.",
  ),
  cap(
    'orchestration.integration.request',
    'orchestration',
    'write',
    'Prepare or execute integration of approved change candidates into the canonical workspace.',
  ),
]

const REPO_MUTATION: readonly CapabilityDescriptor[] = [
  cap('repo.branch.create', 'repo-mutation', 'write', 'Create a branch.'),
  cap('repo.branch.update', 'repo-mutation', 'write', 'Update a branch.'),
  cap('repo.branch.delete', 'repo-mutation', 'write', 'Delete a branch.'),
  cap('repo.content.create', 'repo-mutation', 'write', 'Create a file.'),
  cap('repo.content.update', 'repo-mutation', 'write', 'Modify a file.'),
  cap('repo.content.delete', 'repo-mutation', 'write', 'Delete a file.'),
  cap('repo.commit.create', 'repo-mutation', 'write', 'Create a commit.'),
  cap('repo.commit.push', 'repo-mutation', 'write', 'Push a commit.'),
  cap('repo.pull_request.create', 'repo-mutation', 'write', 'Create a pull request.'),
  cap('repo.pull_request.update', 'repo-mutation', 'write', 'Update a pull request.'),
  cap('repo.pull_request.comment', 'repo-mutation', 'write', 'Comment on a pull request.'),
  cap('repo.review.respond', 'repo-mutation', 'write', 'Respond to review feedback.'),
  cap('repo.issue.create', 'repo-mutation', 'write', 'Create an issue.'),
  cap('repo.issue.update', 'repo-mutation', 'write', 'Update an issue.'),
]

const CI_WORKFLOW: readonly CapabilityDescriptor[] = [
  cap('repo.workflow.dispatch', 'ci-workflow', 'write', 'Dispatch a workflow run.'),
  cap('repo.workflow.rerun', 'ci-workflow', 'write', 'Re-run a workflow.'),
  cap('repo.checks.rerun', 'ci-workflow', 'write', 'Re-run a check.'),
  cap('repo.actions.logs.read', 'ci-workflow', 'read', 'Read Actions logs.'),
  cap('repo.actions.artifacts.read', 'ci-workflow', 'read', 'Read Actions artifacts.'),
]

const HIGH_RISK: readonly CapabilityDescriptor[] = [
  cap('repo.pull_request.merge', 'high-risk', 'high', 'Merge a pull request.', true),
  cap(
    'repo.branch.protection.update',
    'high-risk',
    'critical',
    'Modify branch protection rules.',
    true,
  ),
  cap('repo.settings.update', 'high-risk', 'critical', 'Modify repository settings.', true),
  cap(
    'repo.collaborators.manage',
    'high-risk',
    'critical',
    'Manage repository collaborators.',
    true,
  ),
  cap('repo.webhooks.manage', 'high-risk', 'critical', 'Manage webhooks.', true),
  cap('repo.secrets.manage', 'high-risk', 'critical', 'Manage repository secrets.', true),
  cap('repo.variables.manage', 'high-risk', 'critical', 'Manage repository variables.', true),
  cap('repo.deployments.manage', 'high-risk', 'critical', 'Manage deployments.', true),
  cap('repo.environments.manage', 'high-risk', 'critical', 'Manage environments.', true),
  cap('repo.repository.delete', 'high-risk', 'critical', 'Delete the repository.', true),
  cap('repo.organization.manage', 'high-risk', 'critical', 'Administer the organization.', true),
]

export const ALL_CAPABILITIES: readonly CapabilityDescriptor[] = [
  ...REPO_READ,
  ...SYMBOLWRIGHT_INTELLIGENCE,
  ...ORCHESTRATION,
  ...REPO_MUTATION,
  ...CI_WORKFLOW,
  ...HIGH_RISK,
]

export const CAPABILITY_CATALOG: ReadonlyMap<string, CapabilityDescriptor> = new Map(
  ALL_CAPABILITIES.map((entry) => [entry.id, entry]),
)

export const HIGH_RISK_CAPABILITY_IDS: ReadonlySet<string> = new Set(
  ALL_CAPABILITIES.filter((entry) => entry.highRisk).map((entry) => entry.id),
)

export function isKnownCapability(id: string): boolean {
  return CAPABILITY_CATALOG.has(id)
}

export function isHighRiskCapability(id: string): boolean {
  return HIGH_RISK_CAPABILITY_IDS.has(id)
}

export function capabilityRiskLevel(id: string): RiskLevel | undefined {
  return CAPABILITY_CATALOG.get(id)?.riskLevel
}

/** Never included by a broad/wildcard grant expansion — must always be listed explicitly. */
export function expandNonHighRiskWildcard(ids: readonly string[]): readonly string[] {
  return ids.filter((id) => !isHighRiskCapability(id))
}
