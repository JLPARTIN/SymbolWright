import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import {
  SECRETLINT_CONFIG_RELATIVE_PATH,
  buildSecretScanReleaseEvidence,
  readSecretlintRulesetId,
  readSecretlintVersion,
  renderSecretScanReleaseEvidence,
  runGitHistorySecretScan,
  runNpmPackSecretScan,
  runSecretlintOnFiles,
  runSourceSecretScan,
  type SecretScanResult,
} from './secret-scan.js'

const REPO_ROOT = path.resolve(import.meta.dirname, '../..')
const fixtureDirs: string[] = []

function createFixtureDir(files: Record<string, string>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'symbolwright-secret-scan-fixture-'))
  fixtureDirs.push(dir)
  for (const [relativePath, content] of Object.entries(files)) {
    const full = path.join(dir, relativePath)
    fs.mkdirSync(path.dirname(full), { recursive: true })
    fs.writeFileSync(full, content)
  }
  return dir
}

function createFakeSecretlintBinary(root: string, script: string): void {
  const binDir = path.join(root, 'node_modules', '.bin')
  fs.mkdirSync(binDir, { recursive: true })
  const binPath = path.join(binDir, 'secretlint')
  fs.writeFileSync(binPath, script)
  fs.chmodSync(binPath, 0o755)
}

/** Symlinks the real, already-installed secretlint binary/config into a tiny fixture directory. */
function createSecretlintCapableFixture(files: Record<string, string>): string {
  const dir = createFixtureDir(files)
  fs.symlinkSync(path.join(REPO_ROOT, 'node_modules'), path.join(dir, 'node_modules'), 'dir')
  fs.symlinkSync(
    path.join(REPO_ROOT, SECRETLINT_CONFIG_RELATIVE_PATH),
    path.join(dir, SECRETLINT_CONFIG_RELATIVE_PATH),
  )
  return dir
}

function initGitFixture(dir: string): void {
  execFileSync('git', ['init', '--quiet'], { cwd: dir })
  execFileSync('git', ['config', 'user.email', 'secret-scan-test@example.com'], { cwd: dir })
  execFileSync('git', ['config', 'user.name', 'Secret Scan Test'], { cwd: dir })
}

afterEach(() => {
  for (const dir of fixtureDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

describe('runSecretlintOnFiles', () => {
  it('passes with no findings when there is nothing to scan', () => {
    const result = runSecretlintOnFiles(REPO_ROOT, [], 'source')
    expect(result).toEqual({
      surface: 'source',
      status: 'PASS',
      detail: 'No files to scan.',
      findings: [],
    })
  })

  it('passes a clean file', () => {
    const dir = createFixtureDir({ 'clean.txt': 'nothing sensitive here\n' })
    const result = runSecretlintOnFiles(REPO_ROOT, ['clean.txt'], 'source', { cwd: dir })
    expect(result.status).toBe('PASS')
    expect(result.findings).toEqual([])
  })

  it('detects a GitHub-token-shaped fixture and reports it as a finding', () => {
    const dir = createFixtureDir({
      // secretlint-disable-next-line
      'leaky.txt': 'token: ghp_zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz\n',
    })
    const result = runSecretlintOnFiles(REPO_ROOT, ['leaky.txt'], 'source', { cwd: dir })
    expect(result.status).toBe('FAIL')
    expect(result.findings).toHaveLength(1)
    expect(result.findings[0]?.ruleId).toBe('@secretlint/secretlint-rule-github')
    expect(result.findings[0]?.filePath.endsWith('leaky.txt')).toBe(true)
    expect(result.findings[0]?.line).toBe(1)
  })

  it('detects a private-key-shaped fixture', () => {
    const dir = createFixtureDir({
      'key.pem': [
        '-----BEGIN RSA PRIVATE KEY-----',
        'MIIEpAIBAAKCAQEA1234567890abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ',
        'MIIEpAIBAAKCAQEA1234567890abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ',
        '-----END RSA PRIVATE KEY-----',
        '',
      ].join('\n'),
    })
    const result = runSecretlintOnFiles(REPO_ROOT, ['key.pem'], 'source', { cwd: dir })
    expect(result.status).toBe('FAIL')
    expect(result.findings.some((f) => f.ruleId === '@secretlint/secretlint-rule-privatekey')).toBe(
      true,
    )
  })

  it('detects an npm-token-shaped fixture', () => {
    const dir = createFixtureDir({
      // secretlint-disable-next-line
      '.npmrc': '//registry.npmjs.org/:_authToken=npm_zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz\n',
    })
    const result = runSecretlintOnFiles(REPO_ROOT, ['.npmrc'], 'source', { cwd: dir })
    expect(result.status).toBe('FAIL')
    expect(result.findings.some((f) => f.ruleId === '@secretlint/secretlint-rule-npm')).toBe(true)
  })

  it('never includes the raw secret value or sourceContent in a finding', () => {
    // secretlint-disable-next-line
    const secret = 'ghp_zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz'
    const dir = createFixtureDir({
      // secretlint-disable-next-line
      'leaky.txt': `token: ${secret}\n`,
    })
    const result = runSecretlintOnFiles(REPO_ROOT, ['leaky.txt'], 'source', { cwd: dir })
    const serialized = JSON.stringify(result)
    expect(serialized).not.toContain(secret)
    expect(serialized).not.toContain('sourceContent')
  })

  it('respects a secretlint-disable-next-line comment', () => {
    const dir = createFixtureDir({
      'suppressed.txt': [
        '// secretlint-disable-next-line',
        // secretlint-disable-next-line
        'const fake = "ghp_zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz"',
        '',
      ].join('\n'),
    })
    const result = runSecretlintOnFiles(REPO_ROOT, ['suppressed.txt'], 'source', { cwd: dir })
    expect(result.status).toBe('PASS')
    expect(result.findings).toEqual([])
  })

  it('reports BLOCKED when secretlint is not installed at the given workspace root', () => {
    const fakeRoot = createFixtureDir({})
    const dir = createFixtureDir({ 'clean.txt': 'ok\n' })
    const result = runSecretlintOnFiles(fakeRoot, ['clean.txt'], 'source', { cwd: dir })
    expect(result.status).toBe('BLOCKED')
    expect(result.detail).toContain('not installed')
  })

  it('fails (not silently) when secretlint exits 1 but the output cannot be parsed as JSON', () => {
    const fakeRoot = createFixtureDir({})
    createFakeSecretlintBinary(fakeRoot, '#!/bin/sh\necho "not valid json"\nexit 1\n')
    const dir = createFixtureDir({ 'clean.txt': 'ok\n' })
    const result = runSecretlintOnFiles(fakeRoot, ['clean.txt'], 'source', { cwd: dir })
    expect(result.status).toBe('FAIL')
    expect(result.detail).toContain('could not be parsed')
    expect(result.findings).toEqual([])
  })

  it('truncates a very long execution-failure message', () => {
    const fakeRoot = createFixtureDir({})
    const longStderr = 'x'.repeat(3000)
    createFakeSecretlintBinary(fakeRoot, `#!/bin/sh\nprintf '%s' '${longStderr}' 1>&2\nexit 2\n`)
    const dir = createFixtureDir({ 'clean.txt': 'ok\n' })
    const result = runSecretlintOnFiles(fakeRoot, ['clean.txt'], 'source', { cwd: dir })
    expect(result.status).toBe('FAIL')
    expect(result.detail).toContain('execution failed (exit 2)')
    expect(result.detail).toContain('…')
    expect(result.detail.length).toBeLessThan(longStderr.length)
  })

  it('fails closed (not "no findings") when the secretlint config is missing', () => {
    const dir = createFixtureDir({ 'clean.txt': 'ok\n' })
    // Point workspaceRoot's config resolution at a location with no .secretlintrc.json by using a
    // dedicated fixture root that still has node_modules/.bin/secretlint (via REPO_ROOT) but not a
    // config file: emulate by scanning from a workspaceRoot copy without the config.
    const brokenRoot = createFixtureDir({})
    fs.symlinkSync(
      path.join(REPO_ROOT, 'node_modules'),
      path.join(brokenRoot, 'node_modules'),
      'dir',
    )
    const result = runSecretlintOnFiles(brokenRoot, ['clean.txt'], 'source', { cwd: dir })
    expect(result.status).toBe('FAIL')
    expect(result.detail).toContain('execution failed')
    expect(result.detail).not.toMatch(/no findings/i)
  })
})

describe('runSourceSecretScan', () => {
  it('passes the real current tracked source tree', () => {
    const result = runSourceSecretScan(REPO_ROOT)
    expect(result.status).toBe('PASS')
    expect(result.findings).toEqual([])
  }, 60_000)

  it('reports BLOCKED when not run inside a git checkout', () => {
    const nonGitDir = createFixtureDir({ 'clean.txt': 'ok\n' })
    expect(() => execFileSync('git', ['ls-files'], { cwd: nonGitDir, encoding: 'utf8' })).toThrow()

    const result = runSourceSecretScan(nonGitDir)
    expect(result.status).toBe('BLOCKED')
  })
})

describe('runGitHistorySecretScan', () => {
  it('scans real git history and passes when clean', () => {
    const dir = createSecretlintCapableFixture({ 'clean.txt': 'ok\n' })
    initGitFixture(dir)
    execFileSync('git', ['add', 'clean.txt'], { cwd: dir })
    execFileSync('git', ['commit', '--quiet', '-m', 'init'], { cwd: dir })

    const result = runGitHistorySecretScan(dir)
    expect(result.status).toBe('PASS')
    expect(result.findings).toEqual([])
  }, 30_000)

  it('detects a secret that was added and later removed from git history', () => {
    const dir = createSecretlintCapableFixture({ 'clean.txt': 'ok\n' })
    initGitFixture(dir)
    execFileSync('git', ['add', 'clean.txt'], { cwd: dir })
    execFileSync('git', ['commit', '--quiet', '-m', 'init'], { cwd: dir })
    fs.writeFileSync(
      path.join(dir, 'secret.txt'),
      // secretlint-disable-next-line
      'token: ghp_zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz\n',
    )
    execFileSync('git', ['add', 'secret.txt'], { cwd: dir })
    execFileSync('git', ['commit', '--quiet', '-m', 'add secret'], { cwd: dir })
    fs.rmSync(path.join(dir, 'secret.txt'))
    execFileSync('git', ['add', 'secret.txt'], { cwd: dir })
    execFileSync('git', ['commit', '--quiet', '-m', 'remove secret'], { cwd: dir })

    const result = runGitHistorySecretScan(dir)
    expect(result.status).toBe('FAIL')
    expect(result.findings.length).toBeGreaterThan(0)
    expect(result.findings[0]?.filePath).toBe('<git history diff>')
  }, 30_000)

  it('reports BLOCKED when not run inside a git checkout', () => {
    const nonGitDir = createFixtureDir({ 'clean.txt': 'ok\n' })
    const result = runGitHistorySecretScan(nonGitDir)
    expect(result.status).toBe('BLOCKED')
    expect(result.detail).toContain('Cannot read git history')
  })
})

describe('runNpmPackSecretScan', () => {
  function createPackFixture(files: Record<string, string>): string {
    return createSecretlintCapableFixture({
      'package.json': JSON.stringify({ name: 'secret-scan-fixture', version: '0.0.0' }),
      ...files,
    })
  }

  it('packs a tiny fixture package and passes when clean', () => {
    const dir = createPackFixture({ 'index.js': 'module.exports = 1\n' })
    const result = runNpmPackSecretScan(dir)
    expect(result.status).toBe('PASS')
    expect(result.findings).toEqual([])
  }, 30_000)

  it('detects a secret-shaped fixture inside the packed tarball', () => {
    const dir = createPackFixture({
      // secretlint-disable-next-line
      'index.js': 'module.exports = "ghp_zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz"\n',
    })
    const result = runNpmPackSecretScan(dir)
    expect(result.status).toBe('FAIL')
    expect(result.findings.length).toBeGreaterThan(0)
  }, 30_000)

  it('reports BLOCKED when the pack pipeline fails', () => {
    const dir = createFixtureDir({})
    const result = runNpmPackSecretScan(dir)
    expect(result.status).toBe('BLOCKED')
    expect(result.detail).toContain('Cannot produce or extract the npm pack tarball')
  }, 30_000)
})

describe('readSecretlintVersion / readSecretlintRulesetId', () => {
  it('reads real installed versions', () => {
    expect(readSecretlintVersion(REPO_ROOT)).toMatch(/^\d+\.\d+\.\d+/)
    expect(readSecretlintRulesetId(REPO_ROOT)).toContain(
      '@secretlint/secretlint-rule-preset-recommend@',
    )
  })

  it('falls back to "unknown" when the secretlint package has no version field', () => {
    const dir = createFixtureDir({})
    const pkgDir = path.join(dir, 'node_modules', 'secretlint')
    fs.mkdirSync(pkgDir, { recursive: true })
    fs.writeFileSync(path.join(pkgDir, 'package.json'), JSON.stringify({}))
    expect(readSecretlintVersion(dir)).toBe('unknown')
  })

  it('falls back to "unknown" name/version when the ruleset preset package metadata is incomplete', () => {
    const dir = createFixtureDir({})
    const pkgDir = path.join(dir, 'node_modules', '@secretlint', 'secretlint-rule-preset-recommend')
    fs.mkdirSync(pkgDir, { recursive: true })
    fs.writeFileSync(path.join(pkgDir, 'package.json'), JSON.stringify({}))
    expect(readSecretlintRulesetId(dir)).toBe(
      '@secretlint/secretlint-rule-preset-recommend@unknown',
    )
  })
})

describe('buildSecretScanReleaseEvidence / renderSecretScanReleaseEvidence', () => {
  it('combines status as PASS when every surface passed', () => {
    const results: readonly SecretScanResult[] = [
      { surface: 'source', status: 'PASS', detail: 'clean', findings: [] },
      { surface: 'npm-pack', status: 'PASS', detail: 'clean', findings: [] },
    ]
    const evidence = buildSecretScanReleaseEvidence(REPO_ROOT, results)
    expect(evidence.overallStatus).toBe('PASS')
  })

  it('falls back to "unknown" for scanner/ruleset/commit fields when they cannot be read', () => {
    const dir = createFixtureDir({ 'clean.txt': 'ok\n' })
    const evidence = buildSecretScanReleaseEvidence(dir, [])
    expect(evidence.scannerVersion).toBe('unknown')
    expect(evidence.rulesetId).toBe('unknown')
    expect(evidence.sourceCommitSha).toBe('unknown')
  })

  it('combines status as FAIL if any surface failed', () => {
    const results: readonly SecretScanResult[] = [
      { surface: 'source', status: 'PASS', detail: 'clean', findings: [] },
      { surface: 'git-history', status: 'FAIL', detail: 'bad', findings: [] },
    ]
    const evidence = buildSecretScanReleaseEvidence(REPO_ROOT, results)
    expect(evidence.overallStatus).toBe('FAIL')
  })

  it('combines status as BLOCKED when nothing failed but something was blocked', () => {
    const results: readonly SecretScanResult[] = [
      { surface: 'source', status: 'PASS', detail: 'clean', findings: [] },
      { surface: 'container', status: 'BLOCKED', detail: 'no docker', findings: [] },
    ]
    const evidence = buildSecretScanReleaseEvidence(REPO_ROOT, results)
    expect(evidence.overallStatus).toBe('BLOCKED')
  })

  it('never renders sourceContent or a raw secret value, only the already-redacted message', () => {
    const results: readonly SecretScanResult[] = [
      {
        surface: 'source',
        status: 'FAIL',
        detail: '1 finding',
        findings: [
          {
            filePath: 'leaky.txt',
            ruleId: '@secretlint/secretlint-rule-github',
            line: 1,
            message: 'found GitHub Token(****): ****',
          },
        ],
      },
    ]
    const evidence = buildSecretScanReleaseEvidence(REPO_ROOT, results)
    const rendered = renderSecretScanReleaseEvidence(evidence)
    expect(rendered).toContain('found GitHub Token(****): ****')
    expect(rendered).not.toContain('sourceContent')
    expect(rendered).toContain(evidence.scannerVersion)
    expect(rendered).toContain(evidence.rulesetId)
    expect(rendered).toContain('Overall status: FAIL')
  })

  it('omits the findings section when there are no findings', () => {
    const results: readonly SecretScanResult[] = [
      { surface: 'source', status: 'PASS', detail: 'clean', findings: [] },
    ]
    const evidence = buildSecretScanReleaseEvidence(REPO_ROOT, results)
    const rendered = renderSecretScanReleaseEvidence(evidence)
    expect(rendered).not.toContain('Findings (redacted):')
  })
})
