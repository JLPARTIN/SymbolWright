import { createHash, randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'

import { runGitCommand } from '../runtime/git/git-command-runner.js'
import {
  createGitHubOperationsPolicy,
  type GitHubOperationsPolicy,
} from './github-operations-policy.js'
import type { GitHubRepositoryTarget } from './github-repository-target.js'

/**
 * Real repository acquisition: clones an external GitHub repository (public,
 * anonymous HTTPS only — see limitations below) or duplicates an
 * already-local repository into a controlled workspace directory under
 * `.codemind/external-repos/`. Every destination is computed by this
 * module, never accepted as a caller-supplied path, so acquisition can
 * never write outside the CodeMind workspace.
 *
 * Known limitation: this module does not authenticate git clone with a
 * GitHub token. Embedding a token in a clone URL or command argument would
 * leak it into process listings and, if not scrubbed, into evidence and
 * logs — a risk the non-negotiable "no leaking GitHub tokens" rule exists
 * to prevent. Private-repository acquisition is out of scope for Bundle #8
 * and is documented as a known limitation, not silently unsupported.
 */

export type RepositoryAcquisitionMode = 'dry-run' | 'read-only' | 'writable'
export type RepositoryAcquisitionStrategy = 'clone' | 'duplicate-local'

export interface RepositoryAcquisitionResult {
  readonly strategy: RepositoryAcquisitionStrategy
  readonly mode: RepositoryAcquisitionMode
  readonly acquired: boolean
  readonly workspacePath: string
  readonly sourceUrl: string
  readonly checkedOutRef?: string
  readonly headSha?: string
  readonly evidence: readonly string[]
  readonly error?: string
}

export class RepositoryAcquisitionError extends Error {}

const REF_PATTERN = /^[A-Za-z0-9][A-Za-z0-9/_.-]{0,199}$/

function assertSafeRef(ref: string): void {
  if (
    ref.startsWith('-') ||
    ref.includes('..') ||
    ref.includes(' ') ||
    /[;&|`$<>\n\r(){}[\]*?~!#^\\]/.test(ref) ||
    !REF_PATTERN.test(ref)
  ) {
    throw new RepositoryAcquisitionError(`Unsafe ref requested for checkout: ${ref}`)
  }
}

function sanitizeSlug(value: string): string {
  const cleaned = value
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
  return cleaned.length > 0 ? cleaned.slice(0, 60) : 'repo'
}

function shortHash(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 12)
}

/** Root directory for every acquired external/duplicated repository. Always inside workspaceRoot. */
export function resolveAcquisitionRoot(workspaceRoot: string): string {
  return path.join(path.resolve(workspaceRoot), '.codemind', 'external-repos')
}

function resolveAcquisitionDestination(workspaceRoot: string, slugSeed: string): string {
  const root = resolveAcquisitionRoot(workspaceRoot)
  const destination = path.join(root, `${sanitizeSlug(slugSeed)}-${shortHash(slugSeed)}`)
  if (destination !== root && !destination.startsWith(`${root}${path.sep}`)) {
    throw new RepositoryAcquisitionError(
      'Computed acquisition destination escaped the controlled workspace root.',
    )
  }
  return destination
}

async function verifyAcquiredWorkspace(
  destination: string,
): Promise<{ readonly ok: boolean; readonly headSha?: string; readonly reason?: string }> {
  if (!existsSync(destination)) {
    return { ok: false, reason: 'Acquisition destination does not exist after clone.' }
  }
  if (!existsSync(path.join(destination, '.git'))) {
    return { ok: false, reason: 'Acquisition destination has no .git directory after clone.' }
  }
  const head = await runGitCommand(['rev-parse', 'HEAD'], destination)
  if (head.exitCode !== 0) {
    // git rev-parse HEAD failing means no commit is checked out — but that is
    // only a genuinely empty repository if the remote also has no branches
    // at all. If remote branches exist, the clone's default-branch checkout
    // failed (e.g. the remote's HEAD pointer references a branch that was
    // never pushed) and reporting this as an empty repository would be a
    // false "successful but empty" result instead of the real failure it is.
    const remoteBranches = await runGitCommand(
      ['for-each-ref', 'refs/remotes/origin', '--format=%(refname)'],
      destination,
    )
    const hasRemoteBranches = remoteBranches.stdout.trim().length > 0
    if (hasRemoteBranches) {
      return {
        ok: false,
        reason:
          'Clone completed but no default branch was checked out (the remote HEAD reference does not match any pushed branch). Specify an explicit ref.',
      }
    }
    return { ok: true, reason: 'Repository was cloned but has no commits (empty repository).' }
  }
  return { ok: true, headSha: head.stdout.trim() }
}

export interface AcquireExternalRepositoryOptions {
  readonly target: GitHubRepositoryTarget
  readonly workspaceRoot: string
  readonly mode: RepositoryAcquisitionMode
  readonly ref?: string
  readonly policy?: GitHubOperationsPolicy
}

/**
 * Clones a public external GitHub repository into a controlled workspace
 * directory. In `dry-run` mode, no filesystem or network operation is
 * performed — the plan is reported and validated only.
 */
export async function acquireExternalRepository(
  options: AcquireExternalRepositoryOptions,
): Promise<RepositoryAcquisitionResult> {
  const policy = options.policy ?? createGitHubOperationsPolicy()
  policy.assertAllowed('clone_repo')

  const evidence: string[] = []
  const { target } = options
  const sourceUrl = target.canonicalHttpsUrl
  const requestedRef = options.ref ?? target.ref
  if (requestedRef !== undefined) assertSafeRef(requestedRef)

  const destination = resolveAcquisitionDestination(
    options.workspaceRoot,
    `${target.host}-${target.owner}-${target.repo}-${requestedRef ?? 'default'}-${randomUUID().slice(0, 8)}`,
  )
  evidence.push(`Acquisition plan: clone ${sourceUrl} into ${destination}.`)
  if (requestedRef !== undefined) evidence.push(`Requested ref: ${requestedRef}.`)

  if (options.mode === 'dry-run') {
    evidence.push('Dry-run mode: no clone was performed.')
    return {
      strategy: 'clone',
      mode: options.mode,
      acquired: false,
      workspacePath: destination,
      sourceUrl,
      evidence,
      ...(requestedRef === undefined ? {} : { checkedOutRef: requestedRef }),
    }
  }

  await mkdir(path.dirname(destination), { recursive: true })
  const cloneArgs = ['clone', '--no-tags', sourceUrl, destination]
  const cloneResult = await runGitCommand(cloneArgs, path.dirname(destination), 120_000)
  if (cloneResult.exitCode !== 0) {
    evidence.push(`Clone failed with exit code ${cloneResult.exitCode ?? 'unknown'}.`)
    return {
      strategy: 'clone',
      mode: options.mode,
      acquired: false,
      workspacePath: destination,
      sourceUrl,
      evidence,
      error: cloneResult.stderr.trim().length > 0 ? cloneResult.stderr.trim() : 'git clone failed.',
    }
  }
  evidence.push('Clone completed.')

  if (requestedRef !== undefined) {
    const checkout = await runGitCommand(['checkout', requestedRef], destination)
    if (checkout.exitCode !== 0) {
      evidence.push(`Checkout of ref "${requestedRef}" failed.`)
      return {
        strategy: 'clone',
        mode: options.mode,
        acquired: false,
        workspacePath: destination,
        sourceUrl,
        evidence,
        error:
          checkout.stderr.trim().length > 0
            ? checkout.stderr.trim()
            : `Failed to check out ref "${requestedRef}".`,
      }
    }
    evidence.push(`Checked out ref "${requestedRef}".`)
  }

  const verification = await verifyAcquiredWorkspace(destination)
  if (verification.reason !== undefined) evidence.push(verification.reason)
  if (!verification.ok) {
    return {
      strategy: 'clone',
      mode: options.mode,
      acquired: false,
      workspacePath: destination,
      sourceUrl,
      evidence,
      error: verification.reason ?? 'Acquired workspace failed verification.',
    }
  }

  return {
    strategy: 'clone',
    mode: options.mode,
    acquired: true,
    workspacePath: destination,
    sourceUrl,
    evidence,
    ...(requestedRef === undefined ? {} : { checkedOutRef: requestedRef }),
    ...(verification.headSha === undefined ? {} : { headSha: verification.headSha }),
  }
}

export interface DuplicateLocalRepositoryOptions {
  readonly sourceLocalPath: string
  readonly workspaceRoot: string
  readonly mode: RepositoryAcquisitionMode
  readonly slug: string
  readonly policy?: GitHubOperationsPolicy
}

/**
 * Duplicates an already-local git repository into an isolated workspace
 * directory via `git clone <local-path>`, so the copy has its own working
 * tree and history and mutations to it can never touch the original.
 */
export async function duplicateLocalRepository(
  options: DuplicateLocalRepositoryOptions,
): Promise<RepositoryAcquisitionResult> {
  const policy = options.policy ?? createGitHubOperationsPolicy()
  policy.assertAllowed('clone_repo')

  const evidence: string[] = []
  const sourcePath = path.resolve(options.sourceLocalPath)

  if (!existsSync(sourcePath)) {
    throw new RepositoryAcquisitionError(`Source local repository does not exist: ${sourcePath}`)
  }
  if (!existsSync(path.join(sourcePath, '.git'))) {
    throw new RepositoryAcquisitionError(`Source path is not a git repository: ${sourcePath}`)
  }

  const destination = resolveAcquisitionDestination(
    options.workspaceRoot,
    `${options.slug}-${randomUUID().slice(0, 8)}`,
  )
  evidence.push(`Acquisition plan: duplicate ${sourcePath} into ${destination}.`)

  if (options.mode === 'dry-run') {
    evidence.push('Dry-run mode: no duplication was performed.')
    return {
      strategy: 'duplicate-local',
      mode: options.mode,
      acquired: false,
      workspacePath: destination,
      sourceUrl: sourcePath,
      evidence,
    }
  }

  await mkdir(path.dirname(destination), { recursive: true })
  const cloneResult = await runGitCommand(
    ['clone', '--no-tags', sourcePath, destination],
    path.dirname(destination),
    120_000,
  )
  if (cloneResult.exitCode !== 0) {
    evidence.push(`Duplication failed with exit code ${cloneResult.exitCode ?? 'unknown'}.`)
    return {
      strategy: 'duplicate-local',
      mode: options.mode,
      acquired: false,
      workspacePath: destination,
      sourceUrl: sourcePath,
      evidence,
      error: cloneResult.stderr.trim().length > 0 ? cloneResult.stderr.trim() : 'git clone failed.',
    }
  }
  evidence.push('Duplication completed.')

  const verification = await verifyAcquiredWorkspace(destination)
  if (verification.reason !== undefined) evidence.push(verification.reason)
  if (!verification.ok) {
    return {
      strategy: 'duplicate-local',
      mode: options.mode,
      acquired: false,
      workspacePath: destination,
      sourceUrl: sourcePath,
      evidence,
      error: verification.reason ?? 'Acquired workspace failed verification.',
    }
  }

  return {
    strategy: 'duplicate-local',
    mode: options.mode,
    acquired: true,
    workspacePath: destination,
    sourceUrl: sourcePath,
    evidence,
    ...(verification.headSha === undefined ? {} : { headSha: verification.headSha }),
  }
}
