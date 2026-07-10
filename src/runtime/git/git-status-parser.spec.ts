import { describe, expect, it } from 'vitest'

import { parseGitPorcelainStatus, summarizeGitStatus } from './git-status-parser.js'

describe('parseGitPorcelainStatus', () => {
  it('parses a staged-and-unstaged modification', () => {
    expect(parseGitPorcelainStatus('MM a.txt\n')).toEqual([
      { path: 'a.txt', indexStatus: 'M', worktreeStatus: 'M' },
    ])
  })

  it('parses an untracked file', () => {
    expect(parseGitPorcelainStatus('?? new.txt\n')).toEqual([
      { path: 'new.txt', indexStatus: '?', worktreeStatus: '?' },
    ])
  })

  it('parses a rename with the arrow notation', () => {
    expect(parseGitPorcelainStatus('R  new.txt -> renamed.txt\n')).toEqual([
      {
        path: 'renamed.txt',
        indexStatus: 'R',
        worktreeStatus: ' ',
        renamedFrom: 'new.txt',
      },
    ])
  })

  it('parses multiple lines and ignores a trailing blank line', () => {
    const result = parseGitPorcelainStatus('M  staged.txt\n M unstaged.txt\n?? untracked.txt\n')
    expect(result).toHaveLength(3)
    expect(result.map((entry) => entry.path)).toEqual([
      'staged.txt',
      'unstaged.txt',
      'untracked.txt',
    ])
  })

  it('returns an empty array for a clean tree', () => {
    expect(parseGitPorcelainStatus('')).toEqual([])
  })
})

describe('summarizeGitStatus', () => {
  it('buckets a staged-and-unstaged modification into both staged and unstaged', () => {
    const summary = summarizeGitStatus(parseGitPorcelainStatus('MM a.txt\n'))
    expect(summary.staged.map((e) => e.path)).toEqual(['a.txt'])
    expect(summary.unstaged.map((e) => e.path)).toEqual(['a.txt'])
    expect(summary.untracked).toEqual([])
    expect(summary.conflicted).toEqual([])
  })

  it('buckets untracked files separately from staged/unstaged', () => {
    const summary = summarizeGitStatus(parseGitPorcelainStatus('?? new.txt\n'))
    expect(summary.untracked.map((e) => e.path)).toEqual(['new.txt'])
    expect(summary.staged).toEqual([])
    expect(summary.unstaged).toEqual([])
  })

  it('detects an unmerged conflict', () => {
    const summary = summarizeGitStatus(parseGitPorcelainStatus('UU conflicted.txt\n'))
    expect(summary.conflicted.map((e) => e.path)).toEqual(['conflicted.txt'])
    expect(summary.staged).toEqual([])
    expect(summary.unstaged).toEqual([])
  })

  it('buckets a staged-only addition correctly', () => {
    const summary = summarizeGitStatus(parseGitPorcelainStatus('A  added.txt\n'))
    expect(summary.staged.map((e) => e.path)).toEqual(['added.txt'])
    expect(summary.unstaged).toEqual([])
  })

  it('buckets an unstaged-only modification correctly', () => {
    const summary = summarizeGitStatus(parseGitPorcelainStatus(' M modified.txt\n'))
    expect(summary.unstaged.map((e) => e.path)).toEqual(['modified.txt'])
    expect(summary.staged).toEqual([])
  })
})
