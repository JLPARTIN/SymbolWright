import { runGitCommand } from '../runtime/git/git-command-runner.js'

export const COMMON_DEFAULT_BRANCH_NAMES = new Set(['main', 'master', 'trunk'])

/** Resolves the branch currently checked out in `cwd`, or `undefined` outside a git repository /
 * in a detached-HEAD state (branch-scope checks are skipped rather than guessed in that case). */
export async function resolveCurrentGitBranch(cwd: string): Promise<string | undefined> {
  const result = await runGitCommand(['rev-parse', '--abbrev-ref', 'HEAD'], cwd)
  if (result.exitCode !== 0) return undefined
  const branch = result.stdout.trim()
  return branch.length === 0 || branch === 'HEAD' ? undefined : branch
}

/** Best-effort default-branch detection: prefers the real `origin/HEAD` symbolic ref, falling
 * back to common default-branch names when there is no configured remote (e.g. a fresh local
 * repository in tests). A `false` result here does not weaken protection — the branch-pattern
 * deny-list (`main`, `master`, `release/**`, ...) still applies independently. */
export async function isLikelyDefaultBranch(cwd: string, branch: string): Promise<boolean> {
  const result = await runGitCommand(['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'], cwd)
  if (result.exitCode === 0) {
    const ref = result.stdout.trim()
    const name = ref.startsWith('origin/') ? ref.slice('origin/'.length) : ref
    if (name.length > 0) return name === branch
  }
  return COMMON_DEFAULT_BRANCH_NAMES.has(branch)
}

export const BRANCH_SENSITIVE_ROUTE_CAPABILITIES: ReadonlySet<string> = new Set([
  'repo.content.update',
  'repo.content.create',
  'repo.content.delete',
  'repo.commit.create',
  'repo.commit.push',
  'symbolwright.checkpoint.restore',
])
