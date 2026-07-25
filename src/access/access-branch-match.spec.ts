import { describe, expect, it } from 'vitest'

import {
  matchesAnyBranchPattern,
  matchesAnyRepositoryPattern,
  matchesBranchPattern,
} from './access-branch-match.js'

describe('matchesBranchPattern', () => {
  it('matches an exact literal branch name', () => {
    expect(matchesBranchPattern('main', 'main')).toBe(true)
    expect(matchesBranchPattern('main2', 'main')).toBe(false)
  })

  it('matches a single-segment wildcard', () => {
    expect(matchesBranchPattern('feat/foo', 'feat/*')).toBe(true)
    expect(matchesBranchPattern('feat/foo/bar', 'feat/*')).toBe(false)
  })

  it('matches a double-star suffix across any number of segments', () => {
    expect(matchesBranchPattern('symbolwright/agent/xyz', 'symbolwright/agent/**')).toBe(true)
    expect(matchesBranchPattern('symbolwright/agent/xyz/abc', 'symbolwright/agent/**')).toBe(true)
    expect(matchesBranchPattern('symbolwright/agent', 'symbolwright/agent/**')).toBe(true)
    expect(matchesBranchPattern('symbolwright/other', 'symbolwright/agent/**')).toBe(false)
  })

  it('does not treat release/** as matching an unrelated prefix', () => {
    expect(matchesBranchPattern('release-notes', 'release/**')).toBe(false)
    expect(matchesBranchPattern('release/1.0', 'release/**')).toBe(true)
  })
})

describe('matchesAnyBranchPattern', () => {
  it('returns the first matching pattern', () => {
    expect(matchesAnyBranchPattern('fix/bug-1', ['feat/**', 'fix/**'])).toBe('fix/**')
    expect(matchesAnyBranchPattern('main', ['feat/**', 'fix/**'])).toBeUndefined()
  })
})

describe('matchesBranchPattern edge cases', () => {
  it('matches a `**` in the middle of a pattern against a specific tail segment', () => {
    expect(matchesBranchPattern('feat/agent/x/final', 'feat/**/final')).toBe(true)
    expect(matchesBranchPattern('feat/agent/x/notfinal', 'feat/**/final')).toBe(false)
  })

  it('supports a partial-wildcard segment', () => {
    expect(matchesBranchPattern('release-notes', 'rele*notes')).toBe(true)
    expect(matchesBranchPattern('other', 'rele*notes')).toBe(false)
  })

  it('escapes regex-special characters in a partial-wildcard pattern', () => {
    expect(matchesBranchPattern('v1.0', 'v1.*')).toBe(true)
    expect(matchesBranchPattern('v1x0', 'v1.*')).toBe(false)
  })

  it('rejects a branch with extra trailing segments beyond a non-** pattern', () => {
    expect(matchesBranchPattern('feat/x/extra', 'feat/*')).toBe(false)
  })
})

describe('matchesAnyRepositoryPattern', () => {
  it('matches case-insensitively', () => {
    expect(matchesAnyRepositoryPattern('JLPARTIN/SymbolWright', ['jlpartin/symbolwright'])).toBe(
      true,
    )
    expect(matchesAnyRepositoryPattern('other/repo', ['jlpartin/symbolwright'])).toBe(false)
    expect(matchesAnyRepositoryPattern('any/repo', [])).toBe(false)
  })
})
