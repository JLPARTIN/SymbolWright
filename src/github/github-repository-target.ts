/**
 * Parses and normalizes a GitHub repository reference from any of the
 * accepted input forms into a validated, canonical target. This is the
 * front door for Bundle #8 external repository intake: nothing downstream
 * (acquisition, intake profiling, mission creation) accepts a raw string —
 * everything consumes a `GitHubRepositoryTarget` that has already passed
 * these checks.
 *
 * Deliberately does not resolve a default branch: that requires a network
 * call to GitHub, which this pure parser never makes. Default branch is
 * resolved later by repository-intake-profile.ts from real repository
 * metadata, never guessed here.
 */

export type GitHubRepositoryTargetType =
  | 'repository'
  | 'branch'
  | 'pull-request'
  | 'issue'
  | 'file'
  | 'unknown'

export interface GitHubRepositoryTarget {
  readonly host: string
  readonly owner: string
  readonly repo: string
  readonly targetType: GitHubRepositoryTargetType
  readonly ref?: string
  readonly pullRequestNumber?: number
  readonly issueNumber?: number
  readonly filePath?: string
  readonly sourceUrl: string
  readonly canonicalHttpsUrl: string
}

export class GitHubRepositoryTargetError extends Error {}

const DEFAULT_ALLOWED_HOSTS: readonly string[] = ['github.com']

const SHELL_METACHARACTER_PATTERN = /[;&|`$<>\n\r(){}[\]*?~!#^]/

const OWNER_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/
const REPO_PATTERN = /^[A-Za-z0-9._-]{1,100}$/
const RESERVED_REPO_NAMES = new Set(['.', '..'])

export interface ParseGitHubRepositoryTargetOptions {
  readonly allowedHosts?: readonly string[]
}

function assertNoShellMetacharacters(raw: string): void {
  if (SHELL_METACHARACTER_PATTERN.test(raw)) {
    throw new GitHubRepositoryTargetError(
      `Repository target contains disallowed shell metacharacters: ${raw}`,
    )
  }
}

function assertValidOwnerRepo(owner: string, repo: string, raw: string): void {
  if (!OWNER_PATTERN.test(owner)) {
    throw new GitHubRepositoryTargetError(`Repository target has an invalid owner segment: ${raw}`)
  }
  const repoWithoutGit = repo.replace(/\.git$/, '')
  if (
    repoWithoutGit.length === 0 ||
    RESERVED_REPO_NAMES.has(repoWithoutGit) ||
    !REPO_PATTERN.test(repoWithoutGit) ||
    repoWithoutGit.includes('..')
  ) {
    throw new GitHubRepositoryTargetError(`Repository target has an invalid repo segment: ${raw}`)
  }
}

function assertAllowedHost(host: string, allowedHosts: readonly string[], raw: string): void {
  if (!allowedHosts.includes(host.toLowerCase())) {
    throw new GitHubRepositoryTargetError(
      `Repository target host is not allowlisted: ${host} (from: ${raw})`,
    )
  }
}

function stripDotGit(repo: string): string {
  return repo.replace(/\.git$/, '')
}

function canonicalHttpsUrl(host: string, owner: string, repo: string): string {
  return `https://${host}/${owner}/${repo}`
}

interface ParsedPathSegments {
  readonly targetType: GitHubRepositoryTargetType
  readonly ref?: string
  readonly pullRequestNumber?: number
  readonly issueNumber?: number
  readonly filePath?: string
}

function parseTrailingSegments(segments: readonly string[]): ParsedPathSegments {
  if (segments.length === 0) return { targetType: 'repository' }

  const [kind, ...rest] = segments
  if (kind === 'tree' && rest.length >= 1) {
    return { targetType: 'branch', ref: rest.join('/') }
  }
  if (kind === 'blob' && rest.length >= 2) {
    const [ref, ...pathParts] = rest
    return { targetType: 'file', ref: ref!, filePath: pathParts.join('/') }
  }
  if (kind === 'pull' && rest.length >= 1) {
    const number = Number.parseInt(rest[0]!, 10)
    if (!Number.isNaN(number) && number > 0) {
      return { targetType: 'pull-request', pullRequestNumber: number }
    }
  }
  if (kind === 'issues' && rest.length >= 1) {
    const number = Number.parseInt(rest[0]!, 10)
    if (!Number.isNaN(number) && number > 0) {
      return { targetType: 'issue', issueNumber: number }
    }
  }

  return { targetType: 'unknown' }
}

function parseSshForm(
  raw: string,
  allowedHosts: readonly string[],
): GitHubRepositoryTarget | undefined {
  const match = /^git@([A-Za-z0-9.-]+):([^/@:]+)\/([^/@:]+?)(?:\.git)?\/?$/.exec(raw)
  if (match === undefined || match === null) return undefined
  const [, host, owner, repo] = match
  assertAllowedHost(host!, allowedHosts, raw)
  assertValidOwnerRepo(owner!, repo!, raw)
  const cleanRepo = stripDotGit(repo!)
  return {
    host: host!.toLowerCase(),
    owner: owner!,
    repo: cleanRepo,
    targetType: 'repository',
    sourceUrl: raw,
    canonicalHttpsUrl: canonicalHttpsUrl(host!.toLowerCase(), owner!, cleanRepo),
  }
}

function parseShorthandForm(
  raw: string,
  allowedHosts: readonly string[],
): GitHubRepositoryTarget | undefined {
  if (raw.includes('://') || raw.includes('@') || raw.startsWith('/') || raw.includes(' ')) {
    return undefined
  }
  const segments = raw.split('/')
  if (segments.length !== 2) return undefined
  const [owner, repo] = segments
  if (owner === undefined || repo === undefined || owner.length === 0 || repo.length === 0) {
    return undefined
  }
  assertValidOwnerRepo(owner, repo, raw)
  const host = allowedHosts[0] ?? DEFAULT_ALLOWED_HOSTS[0]!
  const cleanRepo = stripDotGit(repo)
  return {
    host,
    owner,
    repo: cleanRepo,
    targetType: 'repository',
    sourceUrl: raw,
    canonicalHttpsUrl: canonicalHttpsUrl(host, owner, cleanRepo),
  }
}

function parseHttpsForm(raw: string, allowedHosts: readonly string[]): GitHubRepositoryTarget {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new GitHubRepositoryTargetError(`Repository target is not a valid URL: ${raw}`)
  }

  if (url.protocol !== 'https:') {
    throw new GitHubRepositoryTargetError(
      `Unsupported protocol "${url.protocol}" in repository target: ${raw}`,
    )
  }
  if (url.username.length > 0 || url.password.length > 0) {
    throw new GitHubRepositoryTargetError(
      'Repository target must not contain embedded credentials.',
    )
  }

  assertAllowedHost(url.hostname, allowedHosts, raw)

  const segments = url.pathname.split('/').filter((segment) => segment.length > 0)
  const [owner, repo, ...rest] = segments
  if (owner === undefined || repo === undefined) {
    throw new GitHubRepositoryTargetError(`Repository target is missing owner/repo: ${raw}`)
  }
  assertValidOwnerRepo(owner, repo, raw)
  const cleanRepo = stripDotGit(repo)
  const host = url.hostname.toLowerCase()
  const trailing = parseTrailingSegments(rest)

  return {
    host,
    owner,
    repo: cleanRepo,
    sourceUrl: raw,
    canonicalHttpsUrl: canonicalHttpsUrl(host, owner, cleanRepo),
    ...trailing,
  }
}

/**
 * Parses and validates a GitHub repository reference. Throws
 * GitHubRepositoryTargetError with a specific, non-leaky reason for any
 * malformed, unsafe, or unsupported input — never silently coerces.
 */
export function parseGitHubRepositoryTarget(
  input: string,
  options: ParseGitHubRepositoryTargetOptions = {},
): GitHubRepositoryTarget {
  const allowedHosts = (options.allowedHosts ?? DEFAULT_ALLOWED_HOSTS).map((host) =>
    host.toLowerCase(),
  )
  const raw = input.trim()

  if (raw.length === 0) {
    throw new GitHubRepositoryTargetError('Repository target must not be empty.')
  }
  assertNoShellMetacharacters(raw)
  if (raw.includes('..')) {
    throw new GitHubRepositoryTargetError(
      `Repository target must not contain path traversal segments: ${raw}`,
    )
  }

  const ssh = parseSshForm(raw, allowedHosts)
  if (ssh !== undefined) return ssh

  const shorthand = parseShorthandForm(raw, allowedHosts)
  if (shorthand !== undefined) return shorthand

  if (raw.includes('://')) {
    return parseHttpsForm(raw, allowedHosts)
  }

  throw new GitHubRepositoryTargetError(`Unrecognized repository target format: ${raw}`)
}
