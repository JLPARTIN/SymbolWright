import path from 'node:path'

import type { SymbolWrightMission } from '../mission/mission-types.js'
import type { MissionService } from '../mission/mission-service.js'
import type { SymbolWrightRuntimeMode } from '../runtime/types.js'
import {
  acquireExternalRepository,
  type RepositoryAcquisitionMode,
  type RepositoryAcquisitionResult,
} from './repository-acquisition.js'
import {
  createGitHubOperationsPolicy,
  type GitHubOperationsPolicy,
} from './github-operations-policy.js'
import {
  parseGitHubRepositoryTarget,
  type GitHubRepositoryTarget,
  type ParseGitHubRepositoryTargetOptions,
} from './github-repository-target.js'
import {
  buildRepositoryIntakeProfile,
  type RepositoryIntakeProfile,
  type RepositoryMetadataSummary,
} from './repository-intake-profile.js'

/**
 * The mission-runtime integration point for external GitHub repositories.
 *
 * Deliberately does not fork the autonomous mission runtime: once a
 * repository is acquired, this creates a normal SymbolWright mission whose
 * `repository.rootPath` is the acquired workspace. `MissionService.create`
 * already reads real git state (remote URL, branch, HEAD) from whatever
 * path it is given, and the existing autonomy runtime (Bundle #6) and
 * portability discovery (Bundle #7) already operate generically on
 * `mission.repository.rootPath` — neither needed a single line changed to
 * support a mission whose repository happens to be an external clone
 * instead of the SymbolWright checkout itself. Everything downstream (planning,
 * editing, validation, repair, release) reuses that unmodified pipeline.
 */

export interface ExternalRepositoryIntakeOptions {
  /**
   * Either a raw target string (parsed and validated here) or an
   * already-parsed target a caller obtained upstream (e.g. an operator UI
   * that resolved and displayed the target before confirming intake).
   * Exactly one must be provided.
   */
  readonly rawTarget?: string
  readonly target?: GitHubRepositoryTarget
  readonly workspaceRoot: string
  readonly missionService: MissionService
  readonly mode: RepositoryAcquisitionMode
  readonly ref?: string
  readonly name?: string
  readonly objective: string
  readonly runtimeMode: SymbolWrightRuntimeMode
  readonly policy?: GitHubOperationsPolicy
  readonly targetOptions?: ParseGitHubRepositoryTargetOptions
  readonly metadata?: RepositoryMetadataSummary
}

export interface ExternalRepositoryIntakeResult {
  readonly target: GitHubRepositoryTarget
  readonly acquisition: RepositoryAcquisitionResult
  readonly profile: RepositoryIntakeProfile
  readonly mission?: SymbolWrightMission
}

function defaultMissionName(target: GitHubRepositoryTarget, ref: string | undefined): string {
  return ref === undefined
    ? `${target.owner}/${target.repo}`
    : `${target.owner}/${target.repo}@${ref}`
}

/**
 * Parses and validates a GitHub repository target, acquires it into a
 * controlled workspace, runs Bundle #7 portability discovery, and — unless
 * running in `dry-run` mode or acquisition failed — creates a real SymbolWright
 * mission rooted at the acquired workspace so the existing mission runtime
 * can plan, edit, validate, and repair against it.
 */
export async function performExternalRepositoryIntake(
  options: ExternalRepositoryIntakeOptions,
): Promise<ExternalRepositoryIntakeResult> {
  if (options.target === undefined && options.rawTarget === undefined) {
    throw new Error('performExternalRepositoryIntake requires either "target" or "rawTarget".')
  }
  const policy = options.policy ?? createGitHubOperationsPolicy()
  const target =
    options.target ?? parseGitHubRepositoryTarget(options.rawTarget!, options.targetOptions)
  const ref = options.ref ?? target.ref

  const acquisition = await acquireExternalRepository({
    target,
    workspaceRoot: options.workspaceRoot,
    mode: options.mode,
    ...(ref === undefined ? {} : { ref }),
    policy,
  })

  const profile = await buildRepositoryIntakeProfile({
    target,
    acquisition,
    policy,
    ...(options.metadata === undefined ? {} : { metadata: options.metadata }),
  })

  if (options.mode === 'dry-run' || !acquisition.acquired) {
    return { target, acquisition, profile }
  }

  const relativeRepositoryPath = path.relative(
    path.resolve(options.workspaceRoot),
    acquisition.workspacePath,
  )
  const mission = await options.missionService.create({
    name: options.name ?? defaultMissionName(target, ref),
    objective: options.objective,
    workspaceKind: 'repository',
    repositoryPath: relativeRepositoryPath,
    runtimeMode: options.runtimeMode,
    labels: ['external-repository', `origin:${target.host}`, `strategy:${acquisition.strategy}`],
  })

  options.missionService.appendEvent(
    mission.id,
    'github.intake.acquired',
    `Acquired external repository ${target.canonicalHttpsUrl} into an isolated workspace.`,
    {
      target: target.canonicalHttpsUrl,
      targetType: target.targetType,
      strategy: acquisition.strategy,
      mode: acquisition.mode,
      workspacePath: acquisition.workspacePath,
      resolvedRef: acquisition.checkedOutRef,
      ecosystems: profile.portability?.ecosystems ?? [],
      primaryEcosystem: profile.portability?.primaryEcosystem,
      validationCommands: profile.portability?.validationCommands ?? [],
      packageRoots: profile.packageRoots,
      riskFlags: profile.riskFlags,
      writesAllowed: profile.writesAllowed,
      pullRequestCreationAllowed: profile.pullRequestCreationAllowed,
    },
  )

  return { target, acquisition, profile, mission }
}
