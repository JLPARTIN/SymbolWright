export interface GitStatusEntry {
  readonly path: string
  readonly indexStatus: string
  readonly worktreeStatus: string
  readonly renamedFrom?: string
}

/**
 * Parses `git status --porcelain=v1` output into structured entries. Each
 * line is `XY PATH` (or `XY ORIG -> PATH` for renames/copies), where `X` is
 * the index (staged) status and `Y` is the worktree (unstaged) status.
 * `??` marks an untracked file. No existing utility in this codebase does
 * this — every prior git surface (`git-tool.ts`/`git-execute-tool.ts`)
 * only ever returned raw stdout for an LLM to read as text.
 */
export function parseGitPorcelainStatus(porcelain: string): readonly GitStatusEntry[] {
  return porcelain
    .split('\n')
    .filter((line) => line.length > 0)
    .map((line) => {
      const indexStatus = line.charAt(0) || ' '
      const worktreeStatus = line.charAt(1) || ' '
      const rest = line.slice(3)
      const arrow = rest.indexOf(' -> ')

      if (arrow !== -1) {
        return {
          path: rest.slice(arrow + 4),
          indexStatus,
          worktreeStatus,
          renamedFrom: rest.slice(0, arrow),
        }
      }

      return { path: rest, indexStatus, worktreeStatus }
    })
}

export interface GitStatusSummary {
  readonly staged: readonly GitStatusEntry[]
  readonly unstaged: readonly GitStatusEntry[]
  readonly untracked: readonly GitStatusEntry[]
  readonly conflicted: readonly GitStatusEntry[]
}

const CONFLICT_CODES = new Set(['U', 'AA', 'DD'])

/** Groups parsed status entries into staged/unstaged/untracked/conflicted buckets. */
export function summarizeGitStatus(entries: readonly GitStatusEntry[]): GitStatusSummary {
  const staged: GitStatusEntry[] = []
  const unstaged: GitStatusEntry[] = []
  const untracked: GitStatusEntry[] = []
  const conflicted: GitStatusEntry[] = []

  for (const entry of entries) {
    if (entry.indexStatus === '?' && entry.worktreeStatus === '?') {
      untracked.push(entry)
      continue
    }

    if (
      entry.indexStatus === 'U' ||
      entry.worktreeStatus === 'U' ||
      CONFLICT_CODES.has(entry.indexStatus + entry.worktreeStatus)
    ) {
      conflicted.push(entry)
      continue
    }

    if (entry.indexStatus !== ' ' && entry.indexStatus !== '?') {
      staged.push(entry)
    }
    if (entry.worktreeStatus !== ' ' && entry.worktreeStatus !== '?') {
      unstaged.push(entry)
    }
  }

  return { staged, unstaged, untracked, conflicted }
}
