import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import {
  RELEASE_CANDIDATE_MANIFEST_RELATIVE_PATH,
  type ReleaseCandidateManifest,
  assessFormalReleaseCandidate,
  assessReleaseCandidateDevelopmentState,
  assessSourceCommitIdentity,
  loadReleaseCandidateManifest,
} from './release-candidate.js'

const workspaces: string[] = []

const VALID_SHA = '0123456789abcdef0123456789abcdef01234567'
const VALID_TARBALL_SHA = 'a'.repeat(64)
const VALID_DIGEST = `sha256:${'b'.repeat(64)}`

function baseManifest(overrides: Partial<ReleaseCandidateManifest> = {}): ReleaseCandidateManifest {
  return {
    schemaVersion: 1,
    packageName: 'symbolwright',
    candidateVersion: '0.3.0',
    sourceCommitSha: VALID_SHA,
    packageLockVersion: '0.3.0',
    createdAt: '2026-07-31T00:00:00.000Z',
    expectedNpmPackage: 'symbolwright',
    expectedGhcrImage: 'ghcr.io/jlpartin/symbolwright',
    auditDocumentPath: path.join('docs', 'security', 'RELEASE_AUDIT.md'),
    testEvidence: {
      testFilesPassed: 588,
      testsPassed: 4484,
      coverageStatementsPct: 87.73,
      coverageBranchesPct: 80.02,
      coverageFunctionsPct: 92.96,
      coverageLinesPct: 88.72,
    },
    releaseVerdict: 'NOT_RUN',
    ...overrides,
  }
}

function createWorkspace(
  options: {
    readonly version?: string
    readonly manifest?: unknown | 'absent'
    readonly writeAudit?: boolean
  } = {},
): string {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'symbolwright-release-candidate-'))
  workspaces.push(workspace)

  const version = options.version ?? '0.3.0'
  fs.writeFileSync(
    path.join(workspace, 'package.json'),
    JSON.stringify({ name: 'symbolwright', version }),
  )
  fs.writeFileSync(
    path.join(workspace, 'package-lock.json'),
    JSON.stringify({ name: 'symbolwright', version }),
  )

  if (options.writeAudit !== false) {
    const auditPath = path.join(workspace, 'docs', 'security', 'RELEASE_AUDIT.md')
    fs.mkdirSync(path.dirname(auditPath), { recursive: true })
    fs.writeFileSync(
      auditPath,
      [
        '# Release Audit',
        '',
        `**Audited code SHA:** \`${VALID_SHA}\``,
        '',
        '**Release verdict:** **PASS**',
        '',
      ].join('\n'),
    )
  }

  if (options.manifest !== 'absent') {
    fs.writeFileSync(
      path.join(workspace, RELEASE_CANDIDATE_MANIFEST_RELATIVE_PATH),
      JSON.stringify(options.manifest ?? baseManifest()),
    )
  }

  return workspace
}

afterEach(() => {
  for (const workspace of workspaces.splice(0)) {
    fs.rmSync(workspace, { recursive: true, force: true })
  }
})

describe('loadReleaseCandidateManifest', () => {
  it('returns nothing when no manifest exists (legitimate development mode)', () => {
    const workspace = createWorkspace({ manifest: 'absent' })
    expect(loadReleaseCandidateManifest(workspace)).toEqual({})
  })

  it('reports a parse error for malformed JSON', () => {
    const workspace = createWorkspace({ manifest: 'absent' })
    fs.writeFileSync(
      path.join(workspace, RELEASE_CANDIDATE_MANIFEST_RELATIVE_PATH),
      '{ not valid json',
    )
    const { manifest, parseError } = loadReleaseCandidateManifest(workspace)
    expect(manifest).toBeUndefined()
    expect(parseError).toContain('not valid JSON')
  })

  it('reports a shape error for a missing required field', () => {
    const workspace = createWorkspace({ manifest: { schemaVersion: 1 } })
    const { parseError } = loadReleaseCandidateManifest(workspace)
    expect(parseError).toContain('missing required string field')
  })

  it('reports a shape error for an invalid releaseVerdict', () => {
    const workspace = createWorkspace({
      manifest: baseManifest({ releaseVerdict: 'MAYBE' as never }),
    })
    const { parseError } = loadReleaseCandidateManifest(workspace)
    expect(parseError).toContain('releaseVerdict must be PASS, FAIL, BLOCKED, or NOT_RUN')
  })

  it('reports a shape error for missing testEvidence fields', () => {
    const workspace = createWorkspace({
      manifest: { ...baseManifest(), testEvidence: { testFilesPassed: 1 } },
    })
    const { parseError } = loadReleaseCandidateManifest(workspace)
    expect(parseError).toContain('testEvidence is missing required numeric field')
  })
})

describe('assessReleaseCandidateDevelopmentState', () => {
  it('passes normal [Unreleased] development with no manifest', () => {
    const workspace = createWorkspace({ manifest: 'absent' })
    const result = assessReleaseCandidateDevelopmentState(workspace)
    expect(result).toEqual({ status: 'PASS', manifestPresent: false, findings: [] })
  })

  it('passes a fully self-consistent manifest', () => {
    const workspace = createWorkspace()
    const result = assessReleaseCandidateDevelopmentState(workspace)
    expect(result.status).toBe('PASS')
    expect(result.findings).toEqual([])
  })

  it('fails on package/lockfile version mismatch against the manifest', () => {
    const workspace = createWorkspace({ version: '0.3.0' })
    fs.writeFileSync(
      path.join(workspace, RELEASE_CANDIDATE_MANIFEST_RELATIVE_PATH),
      JSON.stringify(baseManifest({ candidateVersion: '0.4.0' })),
    )
    const result = assessReleaseCandidateDevelopmentState(workspace)
    expect(result.status).toBe('FAIL')
    expect(result.findings.some((f) => f.includes('does not match package.json version'))).toBe(
      true,
    )
  })

  it('fails on a stale/malformed sourceCommitSha', () => {
    const workspace = createWorkspace()
    fs.writeFileSync(
      path.join(workspace, RELEASE_CANDIDATE_MANIFEST_RELATIVE_PATH),
      JSON.stringify(baseManifest({ sourceCommitSha: 'not-a-sha' })),
    )
    const result = assessReleaseCandidateDevelopmentState(workspace)
    expect(result.status).toBe('FAIL')
    expect(result.findings.some((f) => f.includes('not an exact 40-character commit SHA'))).toBe(
      true,
    )
  })

  it('fails when the referenced audit document is missing', () => {
    const workspace = createWorkspace({ writeAudit: false })
    const result = assessReleaseCandidateDevelopmentState(workspace)
    expect(result.status).toBe('FAIL')
    expect(result.findings.some((f) => f.includes('auditDocumentPath does not exist'))).toBe(true)
  })

  it('fails when the audit document records a different SHA than the manifest claims', () => {
    const workspace = createWorkspace()
    const otherSha = 'f'.repeat(40)
    fs.writeFileSync(
      path.join(workspace, RELEASE_CANDIDATE_MANIFEST_RELATIVE_PATH),
      JSON.stringify(baseManifest({ sourceCommitSha: otherSha })),
    )
    const result = assessReleaseCandidateDevelopmentState(workspace)
    expect(result.status).toBe('FAIL')
    expect(
      result.findings.some(
        (f) => f.includes(VALID_SHA) && f.includes(otherSha) && f.includes('does not match'),
      ),
    ).toBe(true)
  })

  it('refuses an auditDocumentPath that escapes the repository root via traversal', () => {
    const workspace = createWorkspace()
    const outside = path.join(path.dirname(workspace), 'outside-audit.md')
    fs.writeFileSync(
      outside,
      [
        '# Outside',
        '',
        `**Audited code SHA:** \`${VALID_SHA}\``,
        '',
        '**Release verdict:** **PASS**',
        '',
      ].join('\n'),
    )
    try {
      fs.writeFileSync(
        path.join(workspace, RELEASE_CANDIDATE_MANIFEST_RELATIVE_PATH),
        JSON.stringify(
          baseManifest({ auditDocumentPath: path.join('..', path.basename(outside)) }),
        ),
      )
      const result = assessReleaseCandidateDevelopmentState(workspace)
      expect(result.status).toBe('FAIL')
      expect(result.findings.some((f) => f.includes('escapes the repository root'))).toBe(true)
    } finally {
      fs.rmSync(outside, { force: true })
    }
  })

  it('refuses an absolute auditDocumentPath', () => {
    const workspace = createWorkspace()
    fs.writeFileSync(
      path.join(workspace, RELEASE_CANDIDATE_MANIFEST_RELATIVE_PATH),
      JSON.stringify(baseManifest({ auditDocumentPath: '/etc/passwd' })),
    )
    const result = assessReleaseCandidateDevelopmentState(workspace)
    expect(result.status).toBe('FAIL')
    expect(result.findings.some((f) => f.includes('escapes the repository root'))).toBe(true)
  })

  it('refuses a symlinked auditDocumentPath instead of following it', () => {
    const workspace = createWorkspace()
    const real = path.join(path.dirname(workspace), 'real-audit.md')
    fs.writeFileSync(
      real,
      [
        '# Real',
        '',
        `**Audited code SHA:** \`${VALID_SHA}\``,
        '',
        '**Release verdict:** **PASS**',
        '',
      ].join('\n'),
    )
    const linkPath = path.join(workspace, 'docs', 'security', 'LINKED_AUDIT.md')
    try {
      fs.symlinkSync(real, linkPath)
      fs.writeFileSync(
        path.join(workspace, RELEASE_CANDIDATE_MANIFEST_RELATIVE_PATH),
        JSON.stringify(
          baseManifest({ auditDocumentPath: path.join('docs', 'security', 'LINKED_AUDIT.md') }),
        ),
      )
      const result = assessReleaseCandidateDevelopmentState(workspace)
      expect(result.status).toBe('FAIL')
      expect(result.findings.some((f) => f.includes('must not be a symlink'))).toBe(true)
    } finally {
      fs.rmSync(real, { force: true })
    }
  })

  it('fails when the audit document verdict is not PASS', () => {
    const workspace = createWorkspace()
    const auditPath = path.join(workspace, 'docs', 'security', 'RELEASE_AUDIT.md')
    fs.writeFileSync(
      auditPath,
      fs.readFileSync(auditPath, 'utf8').replace('**PASS**', '**BLOCKED**'),
    )
    const result = assessReleaseCandidateDevelopmentState(workspace)
    expect(result.status).toBe('FAIL')
    expect(result.findings.some((f) => f.includes('verdict is BLOCKED, not PASS'))).toBe(true)
  })

  it('fails when required evidence fields are missing entirely', () => {
    const workspace = createWorkspace({
      manifest: (() => {
        const { testEvidence: _drop, ...rest } = baseManifest()
        void _drop
        return rest
      })(),
    })
    const result = assessReleaseCandidateDevelopmentState(workspace)
    expect(result.status).toBe('FAIL')
  })

  it('fails when a PASS verdict claims artifacts that were never recorded', () => {
    const workspace = createWorkspace()
    fs.writeFileSync(
      path.join(workspace, RELEASE_CANDIDATE_MANIFEST_RELATIVE_PATH),
      JSON.stringify(baseManifest({ releaseVerdict: 'PASS' })),
    )
    const result = assessReleaseCandidateDevelopmentState(workspace)
    expect(result.status).toBe('FAIL')
    expect(
      result.findings.some((f) => f.includes('packageTarballSha256')) &&
        result.findings.some((f) => f.includes('containerDigest')),
    ).toBe(true)
  })

  it('passes a PASS verdict once real artifact evidence is recorded', () => {
    const workspace = createWorkspace()
    fs.writeFileSync(
      path.join(workspace, RELEASE_CANDIDATE_MANIFEST_RELATIVE_PATH),
      JSON.stringify(
        baseManifest({
          releaseVerdict: 'PASS',
          packageTarballSha256: VALID_TARBALL_SHA,
          containerDigest: VALID_DIGEST,
        }),
      ),
    )
    const result = assessReleaseCandidateDevelopmentState(workspace)
    expect(result.status).toBe('PASS')
  })

  it('fails on a mutable/malformed container digest even when a PASS verdict is claimed', () => {
    const workspace = createWorkspace()
    fs.writeFileSync(
      path.join(workspace, RELEASE_CANDIDATE_MANIFEST_RELATIVE_PATH),
      JSON.stringify(
        baseManifest({
          releaseVerdict: 'PASS',
          packageTarballSha256: VALID_TARBALL_SHA,
          containerDigest: 'latest',
        }),
      ),
    )
    const result = assessReleaseCandidateDevelopmentState(workspace)
    expect(result.status).toBe('FAIL')
    expect(result.findings.some((f) => f.includes('containerDigest'))).toBe(true)
  })
})

describe('assessSourceCommitIdentity', () => {
  const head = 'a'.repeat(40)
  const headParent = 'b'.repeat(40)

  it('passes when the SHA is the exact current HEAD', () => {
    expect(assessSourceCommitIdentity(head, head, headParent)).toBeUndefined()
  })

  it('passes when the SHA is HEAD^ (manifest committed as the next commit)', () => {
    expect(assessSourceCommitIdentity(headParent, head, headParent)).toBeUndefined()
  })

  it('fails a stale SHA that merely exists elsewhere in history', () => {
    const stale = 'c'.repeat(40)
    const finding = assessSourceCommitIdentity(stale, head, headParent)
    expect(finding).toContain('is not the current HEAD')
    expect(finding).toContain(stale)
  })

  it('fails when not running inside a git checkout', () => {
    const finding = assessSourceCommitIdentity(head, undefined, undefined)
    expect(finding).toContain('not running inside a git checkout')
  })

  it('fails when there is no HEAD^ (initial commit) and the SHA is not HEAD', () => {
    const other = 'd'.repeat(40)
    const finding = assessSourceCommitIdentity(other, head, undefined)
    expect(finding).toContain('is not the current HEAD')
  })
})

describe('assessFormalReleaseCandidate', () => {
  it('is BLOCKED, not silently passing, when no manifest has been prepared', () => {
    const workspace = createWorkspace({ manifest: 'absent' })
    const result = assessFormalReleaseCandidate(workspace)
    expect(result.status).toBe('BLOCKED')
    expect(result.manifestPresent).toBe(false)
    expect(result.findings[0]).toContain('No release candidate manifest found')
  })

  it('passes a fully consistent, fully evidenced manifest', () => {
    const workspace = createWorkspace()
    fs.writeFileSync(
      path.join(workspace, RELEASE_CANDIDATE_MANIFEST_RELATIVE_PATH),
      JSON.stringify(
        baseManifest({
          releaseVerdict: 'PASS',
          packageTarballSha256: VALID_TARBALL_SHA,
          containerDigest: VALID_DIGEST,
        }),
      ),
    )
    const result = assessFormalReleaseCandidate(workspace)
    expect(result).toEqual({ status: 'PASS', manifestPresent: true, findings: [] })
  })

  it('fails the same way the development-state gate does for an inconsistent manifest', () => {
    const workspace = createWorkspace()
    fs.writeFileSync(
      path.join(workspace, RELEASE_CANDIDATE_MANIFEST_RELATIVE_PATH),
      JSON.stringify(baseManifest({ expectedGhcrImage: 'not-a-valid-image' })),
    )
    const result = assessFormalReleaseCandidate(workspace)
    expect(result.status).toBe('FAIL')
    expect(result.findings.some((f) => f.includes('not a valid ghcr.io image reference'))).toBe(
      true,
    )
  })
})
