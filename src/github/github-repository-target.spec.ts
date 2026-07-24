import { describe, expect, it } from 'vitest'

import {
  GitHubRepositoryTargetError,
  parseGitHubRepositoryTarget,
} from './github-repository-target.js'

describe('parseGitHubRepositoryTarget', () => {
  it('parses a plain https URL', () => {
    const target = parseGitHubRepositoryTarget('https://github.com/JLPARTIN/CodeMind')
    expect(target).toMatchObject({
      host: 'github.com',
      owner: 'JLPARTIN',
      repo: 'CodeMind',
      targetType: 'repository',
      canonicalHttpsUrl: 'https://github.com/JLPARTIN/CodeMind',
    })
  })

  it('parses a .git-suffixed https URL', () => {
    const target = parseGitHubRepositoryTarget('https://github.com/JLPARTIN/CodeMind.git')
    expect(target.repo).toBe('CodeMind')
    expect(target.canonicalHttpsUrl).toBe('https://github.com/JLPARTIN/CodeMind')
  })

  it('parses an SSH form URL', () => {
    const target = parseGitHubRepositoryTarget('git@github.com:JLPARTIN/CodeMind.git')
    expect(target).toMatchObject({
      host: 'github.com',
      owner: 'JLPARTIN',
      repo: 'CodeMind',
      targetType: 'repository',
    })
  })

  it('parses a /tree/<branch> URL as a branch target', () => {
    const target = parseGitHubRepositoryTarget(
      'https://github.com/JLPARTIN/CodeMind/tree/feature/foo',
    )
    expect(target.targetType).toBe('branch')
    expect(target.ref).toBe('feature/foo')
  })

  it('parses a /pull/<number> URL as a pull-request target', () => {
    const target = parseGitHubRepositoryTarget('https://github.com/JLPARTIN/CodeMind/pull/123')
    expect(target.targetType).toBe('pull-request')
    expect(target.pullRequestNumber).toBe(123)
  })

  it('parses an /issues/<number> URL as an issue target', () => {
    const target = parseGitHubRepositoryTarget('https://github.com/JLPARTIN/CodeMind/issues/456')
    expect(target.targetType).toBe('issue')
    expect(target.issueNumber).toBe(456)
  })

  it('parses a /blob/<ref>/<path> URL as a file target', () => {
    const target = parseGitHubRepositoryTarget(
      'https://github.com/JLPARTIN/CodeMind/blob/main/src/cli.ts',
    )
    expect(target.targetType).toBe('file')
    expect(target.ref).toBe('main')
    expect(target.filePath).toBe('src/cli.ts')
  })

  it('marks unrecognized trailing path segments as unknown rather than guessing', () => {
    const target = parseGitHubRepositoryTarget(
      'https://github.com/JLPARTIN/CodeMind/actions/runs/123',
    )
    expect(target.targetType).toBe('unknown')
  })

  it('marks a /pull/ URL with a non-numeric or non-positive number as unknown rather than a fake PR number', () => {
    expect(
      parseGitHubRepositoryTarget('https://github.com/JLPARTIN/CodeMind/pull/abc').targetType,
    ).toBe('unknown')
    expect(
      parseGitHubRepositoryTarget('https://github.com/JLPARTIN/CodeMind/pull/0').targetType,
    ).toBe('unknown')
  })

  it('marks an /issues/ URL with a non-numeric or non-positive number as unknown rather than a fake issue number', () => {
    expect(
      parseGitHubRepositoryTarget('https://github.com/JLPARTIN/CodeMind/issues/abc').targetType,
    ).toBe('unknown')
    expect(
      parseGitHubRepositoryTarget('https://github.com/JLPARTIN/CodeMind/issues/-1').targetType,
    ).toBe('unknown')
  })

  it('marks a /blob/ URL with no file path segment as unknown rather than a fake file target', () => {
    expect(
      parseGitHubRepositoryTarget('https://github.com/JLPARTIN/CodeMind/blob/main').targetType,
    ).toBe('unknown')
  })

  it('parses an unambiguous owner/repo shorthand', () => {
    const target = parseGitHubRepositoryTarget('JLPARTIN/CodeMind')
    expect(target).toMatchObject({
      host: 'github.com',
      owner: 'JLPARTIN',
      repo: 'CodeMind',
      targetType: 'repository',
    })
  })

  it('trims surrounding whitespace', () => {
    const target = parseGitHubRepositoryTarget('  JLPARTIN/CodeMind  ')
    expect(target.owner).toBe('JLPARTIN')
  })

  it('rejects a shorthand with more than one slash rather than guessing which segments are owner/repo', () => {
    expect(() => parseGitHubRepositoryTarget('a/b/c')).toThrow(GitHubRepositoryTargetError)
  })

  it('rejects a shorthand with an empty repo segment', () => {
    expect(() => parseGitHubRepositoryTarget('owner/')).toThrow(GitHubRepositoryTargetError)
  })

  it('falls back to the default host when an empty allowedHosts list is supplied', () => {
    const target = parseGitHubRepositoryTarget('JLPARTIN/CodeMind', { allowedHosts: [] })
    expect(target.host).toBe('github.com')
  })

  it('rejects an empty target', () => {
    expect(() => parseGitHubRepositoryTarget('')).toThrow(GitHubRepositoryTargetError)
  })

  it('rejects path traversal segments', () => {
    expect(() => parseGitHubRepositoryTarget('https://github.com/../../etc/passwd')).toThrow(
      /traversal/,
    )
    expect(() => parseGitHubRepositoryTarget('JLPARTIN/../etc')).toThrow(
      GitHubRepositoryTargetError,
    )
  })

  it('rejects malformed owner/repo segments', () => {
    expect(() => parseGitHubRepositoryTarget('https://github.com/-bad-owner/repo')).toThrow(
      GitHubRepositoryTargetError,
    )
    expect(() => parseGitHubRepositoryTarget('https://github.com/owner/')).toThrow(
      GitHubRepositoryTargetError,
    )
  })

  it('rejects unsupported protocols', () => {
    expect(() => parseGitHubRepositoryTarget('ftp://github.com/JLPARTIN/CodeMind')).toThrow(
      /protocol/,
    )
    expect(() => parseGitHubRepositoryTarget('file:///etc/passwd')).toThrow(
      GitHubRepositoryTargetError,
    )
    expect(() => parseGitHubRepositoryTarget('javascript:alert(1)')).toThrow(
      GitHubRepositoryTargetError,
    )
  })

  it('rejects embedded credentials in an https URL', () => {
    expect(() =>
      parseGitHubRepositoryTarget('https://token:x-oauth-basic@github.com/JLPARTIN/CodeMind'),
    ).toThrow(/credentials/)
  })

  it('rejects suspicious hosts not on the allowlist', () => {
    expect(() => parseGitHubRepositoryTarget('https://evil-github.com/JLPARTIN/CodeMind')).toThrow(
      /not allowlisted/,
    )
    expect(() => parseGitHubRepositoryTarget('git@evil.example.com:JLPARTIN/CodeMind.git')).toThrow(
      /not allowlisted/,
    )
  })

  it('allows an explicitly supplied additional host', () => {
    const target = parseGitHubRepositoryTarget('https://github.example.com/JLPARTIN/CodeMind', {
      allowedHosts: ['github.example.com'],
    })
    expect(target.host).toBe('github.example.com')
  })

  it('rejects shell metacharacters', () => {
    for (const malicious of [
      'JLPARTIN/CodeMind; rm -rf /',
      'JLPARTIN/CodeMind`whoami`',
      'JLPARTIN/CodeMind$(whoami)',
      'https://github.com/JLPARTIN/CodeMind|cat /etc/passwd',
    ]) {
      expect(() => parseGitHubRepositoryTarget(malicious)).toThrow(GitHubRepositoryTargetError)
    }
  })

  it('rejects an unrecognized format', () => {
    expect(() => parseGitHubRepositoryTarget('not a repository reference at all')).toThrow(
      GitHubRepositoryTargetError,
    )
  })

  it('never fabricates a default branch — it is not part of the parsed target', () => {
    const target = parseGitHubRepositoryTarget('JLPARTIN/CodeMind')
    expect('defaultBranch' in target).toBe(false)
  })
})
