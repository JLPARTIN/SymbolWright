import type {
  RepositoryPortabilityDiscoveryOptions,
  RepositoryPortabilityProfile,
} from '../portability/repository-portability.js'
import { discoverUniversalRepositoryPortability } from '../portability/universal-repository-portability.js'
import type { GitHubOperationsPolicy } from './github-operations-policy.js'
import type { GitHubRepositoryTarget } from './github-repository-target.js'
import type {
  RepositoryAcquisitionResult,
  RepositoryAcquisitionStrategy,
} from './repository-acquisition.js'

/**
 * Builds a structured intake profile for a repository before any mission
 * edits happen — the single artifact the mission planner, the operator UI,
 * and the PR packet all read from. Nothing in this profile is fabricated:
 * fields that require data CodeMind does not have (live GitHub metadata,
 * ecosystem detection on a repository that failed to acquire) are simply
 * absent rather than guessed.
 */

export interface RepositoryMetadataSummary {
  readonly defaultBranch: string
  readonly isFork: boolean
  readonly isPrivate: boolean
  readonly archived: boolean
}

export type RepositoryIntakeOrigin = 'external-clone' | 'local-duplicate'

export interface RepositoryIntakeProfile {
  readonly target: GitHubRepositoryTarget
  readonly metadata?: RepositoryMetadataSummary
  readonly workspacePath: string
  readonly resolvedRef?: string
  readonly remoteUrl: string
  readonly acquisitionStrategy: RepositoryAcquisitionStrategy
  readonly acquired: boolean
  readonly origin: RepositoryIntakeOrigin
  readonly portability?: RepositoryPortabilityProfile
  readonly packageRoots: readonly string[]
  readonly ciWorkflowEvidence: readonly string[]
  readonly riskFlags: readonly string[]
  readonly writesAllowed: boolean
  readonly pullRequestCreationAllowed: boolean
  readonly evidence: readonly string[]
}

export interface BuildRepositoryIntakeProfileOptions {
  readonly target: GitHubRepositoryTarget
  readonly acquisition: RepositoryAcquisitionResult
  readonly policy: GitHubOperationsPolicy
  readonly metadata?: RepositoryMetadataSummary
  readonly portabilityOptions?: RepositoryPortabilityDiscoveryOptions
}

function originFor(strategy: RepositoryAcquisitionStrategy): RepositoryIntakeOrigin {
  return strategy === 'clone' ? 'external-clone' : 'local-duplicate'
}

export async function buildRepositoryIntakeProfile(
  options: BuildRepositoryIntakeProfileOptions,
): Promise<RepositoryIntakeProfile> {
  const { target, acquisition, policy, metadata } = options
  const writesAllowed = policy.isAllowed('push_branch')
  const pullRequestCreationAllowed = policy.isAllowed('open_pull_request')

  if (!acquisition.acquired) {
    return {
      target,
      ...(metadata === undefined ? {} : { metadata }),
      workspacePath: acquisition.workspacePath,
      remoteUrl: acquisition.sourceUrl,
      acquisitionStrategy: acquisition.strategy,
      acquired: false,
      origin: originFor(acquisition.strategy),
      packageRoots: [],
      ciWorkflowEvidence: [],
      riskFlags: ['acquisition-failed'],
      writesAllowed,
      pullRequestCreationAllowed,
      evidence: [...acquisition.evidence],
    }
  }

  const portability = await discoverUniversalRepositoryPortability(
    acquisition.workspacePath,
    options.portabilityOptions,
  )

  const packageRoots = [
    ...new Set(portability.validation.map((entry) => entry.workingDirectory)),
  ].sort()
  const ciWorkflowEvidence = portability.validation
    .filter((entry) => entry.source === 'ci-workflow')
    .map((entry) => `${entry.phase}: ${entry.command} (${entry.workingDirectory})`)

  const riskFlags: string[] = []
  if (portability.validation.length === 0) riskFlags.push('no-validation-commands-discovered')
  if (portability.mixed) riskFlags.push('mixed-ecosystem-repository')
  if (portability.confidence === 'low') riskFlags.push('low-confidence-ecosystem-detection')
  if (portability.researchQueries.length > 0)
    riskFlags.push('unsupported-toolchain-requires-research')
  if (metadata?.isFork === true) riskFlags.push('repository-is-a-fork')
  if (metadata?.archived === true) riskFlags.push('repository-is-archived')
  if (metadata?.isPrivate === true) riskFlags.push('repository-is-private')

  return {
    target,
    ...(metadata === undefined ? {} : { metadata }),
    workspacePath: acquisition.workspacePath,
    ...(acquisition.checkedOutRef === undefined ? {} : { resolvedRef: acquisition.checkedOutRef }),
    remoteUrl: acquisition.sourceUrl,
    acquisitionStrategy: acquisition.strategy,
    acquired: true,
    origin: originFor(acquisition.strategy),
    portability,
    packageRoots,
    ciWorkflowEvidence,
    riskFlags,
    writesAllowed,
    pullRequestCreationAllowed,
    evidence: [...acquisition.evidence, ...portability.evidence],
  }
}

export function renderRepositoryIntakeProfile(profile: RepositoryIntakeProfile): string {
  const lines = [
    'CodeMind Repository Intake Profile',
    '',
    `Target: ${profile.target.canonicalHttpsUrl}`,
    `Origin: ${profile.origin}`,
    `Acquisition strategy: ${profile.acquisitionStrategy}`,
    `Acquired: ${profile.acquired ? 'yes' : 'no'}`,
    `Workspace path: ${profile.workspacePath}`,
  ]

  if (profile.resolvedRef !== undefined) lines.push(`Resolved ref: ${profile.resolvedRef}`)
  if (profile.metadata !== undefined) {
    lines.push(
      `Default branch: ${profile.metadata.defaultBranch}`,
      `Fork: ${profile.metadata.isFork ? 'yes' : 'no'}`,
      `Private: ${profile.metadata.isPrivate ? 'yes' : 'no'}`,
      `Archived: ${profile.metadata.archived ? 'yes' : 'no'}`,
    )
  }

  if (profile.portability !== undefined) {
    lines.push(
      '',
      `Ecosystems: ${profile.portability.ecosystems.join(', ')}`,
      `Primary ecosystem: ${profile.portability.primaryEcosystem}`,
      `Mixed repository: ${profile.portability.mixed ? 'yes' : 'no'}`,
      `Detection confidence: ${profile.portability.confidence}`,
      `Manifests: ${profile.portability.manifests.length}`,
      `Package roots: ${profile.packageRoots.length === 0 ? 'none' : profile.packageRoots.join(', ')}`,
      `Validation commands: ${profile.portability.validationCommands.length}`,
    )
    for (const command of profile.portability.validationCommands) {
      lines.push(`  - ${command}`)
    }
  }

  if (profile.ciWorkflowEvidence.length > 0) {
    lines.push('', 'CI workflow evidence:')
    lines.push(...profile.ciWorkflowEvidence.map((entry) => `  - ${entry}`))
  }

  lines.push(
    '',
    `Write operations allowed: ${profile.writesAllowed ? 'yes' : 'no'}`,
    `Pull request creation allowed: ${profile.pullRequestCreationAllowed ? 'yes' : 'no'}`,
  )

  if (profile.riskFlags.length > 0) {
    lines.push('', 'Risk flags:')
    lines.push(...profile.riskFlags.map((flag) => `  - ${flag}`))
  }

  return lines.join('\n')
}
