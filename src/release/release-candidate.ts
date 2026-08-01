import fs from 'node:fs'
import path from 'node:path'

import { AUDITED_SHA_PATTERN, RELEASE_VERDICT_PATTERN } from './release-closure-integrity.js'

export const RELEASE_CANDIDATE_MANIFEST_RELATIVE_PATH = 'release-candidate.json'

export type ReleaseEvidenceVerdict = 'PASS' | 'FAIL' | 'BLOCKED' | 'NOT_RUN'

export interface ReleaseCandidateTestEvidence {
  readonly testFilesPassed: number
  readonly testsPassed: number
  readonly coverageStatementsPct: number
  readonly coverageBranchesPct: number
  readonly coverageFunctionsPct: number
  readonly coverageLinesPct: number
}

export interface ReleaseCandidateManifest {
  readonly schemaVersion: 1
  readonly packageName: string
  readonly candidateVersion: string
  readonly sourceCommitSha: string
  readonly packageLockVersion: string
  readonly createdAt: string
  readonly expectedNpmPackage: string
  readonly expectedGhcrImage: string
  readonly auditDocumentPath: string
  readonly testEvidence: ReleaseCandidateTestEvidence
  readonly packageTarballSha256?: string
  readonly containerDigest?: string
  readonly releaseVerdict: ReleaseEvidenceVerdict
}

export type ReleaseCandidateStatus = 'PASS' | 'FAIL' | 'BLOCKED'

export interface ReleaseCandidateAssessment {
  readonly status: ReleaseCandidateStatus
  readonly manifestPresent: boolean
  readonly findings: readonly string[]
}

const COMMIT_SHA_PATTERN = /^[0-9a-f]{40}$/
const SEMVER_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/
const TARBALL_SHA256_PATTERN = /^[0-9a-f]{64}$/
const CONTAINER_DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/
const GHCR_IMAGE_PATTERN =
  /^ghcr\.io\/[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?\/[a-z0-9](?:[a-z0-9._/-]*[a-z0-9])?$/

interface PackageJsonShape {
  readonly name?: string
  readonly version?: string
}

interface PackageLockJsonShape {
  readonly version?: string
}

function readJson(filePath: string): unknown {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

function readPackageJson(workspaceRoot: string): PackageJsonShape {
  return readJson(path.join(workspaceRoot, 'package.json')) as PackageJsonShape
}

function readPackageLockJson(workspaceRoot: string): PackageLockJsonShape {
  return readJson(path.join(workspaceRoot, 'package-lock.json')) as PackageLockJsonShape
}

/**
 * Loads and structurally validates the release candidate manifest. A missing manifest is not an
 * error here -- it means the workspace is on normal `[Unreleased]` development, which callers
 * distinguish from a malformed or inconsistent manifest.
 */
export function loadReleaseCandidateManifest(workspaceRoot: string): {
  readonly manifest?: ReleaseCandidateManifest
  readonly parseError?: string
} {
  const manifestPath = path.join(workspaceRoot, RELEASE_CANDIDATE_MANIFEST_RELATIVE_PATH)
  if (!fs.existsSync(manifestPath)) return {}

  let raw: unknown
  try {
    raw = readJson(manifestPath)
  } catch (error) {
    return { parseError: `release-candidate.json is not valid JSON: ${errorMessage(error)}` }
  }

  const shapeError = findShapeError(raw)
  if (shapeError !== undefined) return { parseError: shapeError }

  return { manifest: raw as ReleaseCandidateManifest }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function findShapeError(raw: unknown): string | undefined {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return 'release-candidate.json must be a JSON object'
  }
  const value = raw as Record<string, unknown>

  if (value['schemaVersion'] !== 1) {
    return 'release-candidate.json schemaVersion must be exactly 1'
  }
  for (const field of [
    'packageName',
    'candidateVersion',
    'sourceCommitSha',
    'packageLockVersion',
    'createdAt',
    'expectedNpmPackage',
    'expectedGhcrImage',
    'auditDocumentPath',
    'releaseVerdict',
  ]) {
    if (typeof value[field] !== 'string' || (value[field] as string).length === 0) {
      return `release-candidate.json is missing required string field: ${field}`
    }
  }
  const verdict = value['releaseVerdict']
  if (verdict !== 'PASS' && verdict !== 'FAIL' && verdict !== 'BLOCKED' && verdict !== 'NOT_RUN') {
    return `release-candidate.json releaseVerdict must be PASS, FAIL, BLOCKED, or NOT_RUN, received ${String(verdict)}`
  }
  const testEvidence = value['testEvidence']
  if (typeof testEvidence !== 'object' || testEvidence === null || Array.isArray(testEvidence)) {
    return 'release-candidate.json is missing required object field: testEvidence'
  }
  const evidence = testEvidence as Record<string, unknown>
  for (const field of [
    'testFilesPassed',
    'testsPassed',
    'coverageStatementsPct',
    'coverageBranchesPct',
    'coverageFunctionsPct',
    'coverageLinesPct',
  ]) {
    if (typeof evidence[field] !== 'number' || !Number.isFinite(evidence[field])) {
      return `release-candidate.json testEvidence is missing required numeric field: ${field}`
    }
  }
  for (const field of ['packageTarballSha256', 'containerDigest'] as const) {
    if (field in value && typeof value[field] !== 'string') {
      return `release-candidate.json ${field} must be a string when present`
    }
  }
  return undefined
}

/**
 * The single rule set both the non-strict development-state gate and the strict formal-candidate
 * verification apply once a manifest is present -- only whether a *missing* manifest is itself a
 * finding differs between the two callers.
 */
function validateManifestConsistency(
  workspaceRoot: string,
  manifest: ReleaseCandidateManifest,
): string[] {
  const findings: string[] = []

  let pkg: PackageJsonShape = {}
  try {
    pkg = readPackageJson(workspaceRoot)
  } catch {
    findings.push('Cannot read package.json to validate the release candidate manifest')
  }
  let lock: PackageLockJsonShape = {}
  try {
    lock = readPackageLockJson(workspaceRoot)
  } catch {
    findings.push('Cannot read package-lock.json to validate the release candidate manifest')
  }

  if (manifest.packageName !== pkg.name) {
    findings.push(
      `Release candidate manifest packageName "${manifest.packageName}" does not match package.json name "${String(pkg.name)}"`,
    )
  }
  if (manifest.expectedNpmPackage !== pkg.name) {
    findings.push(
      `Release candidate manifest expectedNpmPackage "${manifest.expectedNpmPackage}" does not match package.json name "${String(pkg.name)}"`,
    )
  }
  if (!SEMVER_PATTERN.test(manifest.candidateVersion)) {
    findings.push(
      `Release candidate manifest candidateVersion "${manifest.candidateVersion}" is not a valid semantic version`,
    )
  }
  if (manifest.candidateVersion !== pkg.version) {
    findings.push(
      `Release candidate manifest candidateVersion "${manifest.candidateVersion}" does not match package.json version "${String(pkg.version)}"`,
    )
  }
  if (manifest.packageLockVersion !== lock.version) {
    findings.push(
      `Release candidate manifest packageLockVersion "${manifest.packageLockVersion}" does not match package-lock.json version "${String(lock.version)}"`,
    )
  }
  if (manifest.candidateVersion !== manifest.packageLockVersion) {
    findings.push(
      `Release candidate manifest candidateVersion "${manifest.candidateVersion}" and packageLockVersion "${manifest.packageLockVersion}" disagree`,
    )
  }
  if (!COMMIT_SHA_PATTERN.test(manifest.sourceCommitSha)) {
    findings.push(
      `Release candidate manifest sourceCommitSha "${manifest.sourceCommitSha}" is not an exact 40-character commit SHA`,
    )
  }
  if (Number.isNaN(Date.parse(manifest.createdAt))) {
    findings.push(
      `Release candidate manifest createdAt "${manifest.createdAt}" is not a valid date`,
    )
  }
  if (!GHCR_IMAGE_PATTERN.test(manifest.expectedGhcrImage)) {
    findings.push(
      `Release candidate manifest expectedGhcrImage "${manifest.expectedGhcrImage}" is not a valid ghcr.io image reference`,
    )
  }

  validateAuditDocument(workspaceRoot, manifest, findings)
  validateTestEvidence(manifest, findings)
  validateArtifactEvidenceRecorded(manifest, findings)

  return findings
}

/**
 * Resolves `auditDocumentPath` against the workspace root and refuses anything that would let a
 * manifest point outside its own repository: `../` traversal escaping the root, an absolute path,
 * or a symlink anywhere on the path (checked with `lstat`, never followed) standing in for the
 * real file. A candidate must not be able to launder an unrelated document as its own evidence.
 */
function resolveContainedAuditPath(
  workspaceRoot: string,
  manifest: ReleaseCandidateManifest,
  findings: string[],
): string | undefined {
  const root = path.resolve(workspaceRoot)
  const resolved = path.resolve(root, manifest.auditDocumentPath)
  const relative = path.relative(root, resolved)
  if (
    path.isAbsolute(manifest.auditDocumentPath) ||
    relative.startsWith(`..${path.sep}`) ||
    relative === '..' ||
    path.isAbsolute(relative)
  ) {
    findings.push(
      `Release candidate manifest auditDocumentPath escapes the repository root: ${manifest.auditDocumentPath}`,
    )
    return undefined
  }

  let stat: fs.Stats
  try {
    stat = fs.lstatSync(resolved)
  } catch {
    findings.push(
      `Release candidate manifest auditDocumentPath does not exist: ${manifest.auditDocumentPath}`,
    )
    return undefined
  }
  if (stat.isSymbolicLink()) {
    findings.push(
      `Release candidate manifest auditDocumentPath must not be a symlink: ${manifest.auditDocumentPath}`,
    )
    return undefined
  }
  if (!stat.isFile()) {
    findings.push(
      `Release candidate manifest auditDocumentPath does not exist: ${manifest.auditDocumentPath}`,
    )
    return undefined
  }
  return resolved
}

function validateAuditDocument(
  workspaceRoot: string,
  manifest: ReleaseCandidateManifest,
  findings: string[],
): void {
  const auditPath = resolveContainedAuditPath(workspaceRoot, manifest, findings)
  if (auditPath === undefined) return

  let content: string
  try {
    content = fs.readFileSync(auditPath, 'utf8')
  } catch {
    findings.push(`Release candidate audit document cannot be read: ${manifest.auditDocumentPath}`)
    return
  }

  const auditedSha = AUDITED_SHA_PATTERN.exec(content)?.[1]
  if (auditedSha === undefined) {
    findings.push(
      `Release candidate audit document does not record an exact audited code SHA: ${manifest.auditDocumentPath}`,
    )
  } else if (auditedSha !== manifest.sourceCommitSha) {
    findings.push(
      `Release candidate audit document audited SHA "${auditedSha}" does not match manifest sourceCommitSha "${manifest.sourceCommitSha}": ${manifest.auditDocumentPath}`,
    )
  }
  const verdict = RELEASE_VERDICT_PATTERN.exec(content)?.[1]
  if (verdict === undefined) {
    findings.push(
      `Release candidate audit document does not record a valid release verdict: ${manifest.auditDocumentPath}`,
    )
  } else if (verdict !== 'PASS') {
    findings.push(
      `Release candidate audit document verdict is ${verdict}, not PASS: ${manifest.auditDocumentPath}`,
    )
  }
}

function validateTestEvidence(manifest: ReleaseCandidateManifest, findings: string[]): void {
  const evidence = manifest.testEvidence
  if (evidence.testFilesPassed < 0 || evidence.testsPassed < 0) {
    findings.push('Release candidate manifest testEvidence counts must not be negative')
  }
  for (const [label, value] of [
    ['coverageStatementsPct', evidence.coverageStatementsPct],
    ['coverageBranchesPct', evidence.coverageBranchesPct],
    ['coverageFunctionsPct', evidence.coverageFunctionsPct],
    ['coverageLinesPct', evidence.coverageLinesPct],
  ] as const) {
    if (value < 0 || value > 100) {
      findings.push(`Release candidate manifest testEvidence.${label} must be between 0 and 100`)
    }
  }
}

/**
 * A manifest that declares an overall PASS verdict is claiming the release's artifacts are done
 * and ready to publish -- it must not do so while the artifact identity fields that prove that
 * (the tarball checksum, the container digest) are still unset placeholders.
 */
function validateArtifactEvidenceRecorded(
  manifest: ReleaseCandidateManifest,
  findings: string[],
): void {
  if (manifest.releaseVerdict !== 'PASS') return

  if (
    manifest.packageTarballSha256 === undefined ||
    !TARBALL_SHA256_PATTERN.test(manifest.packageTarballSha256)
  ) {
    findings.push(
      'Release candidate manifest declares releaseVerdict PASS without a recorded, validly formatted packageTarballSha256',
    )
  }
  if (
    manifest.containerDigest === undefined ||
    !CONTAINER_DIGEST_PATTERN.test(manifest.containerDigest)
  ) {
    findings.push(
      'Release candidate manifest declares releaseVerdict PASS without a recorded, validly formatted containerDigest',
    )
  }
}

/**
 * Non-strict gate used by normal `npm run release-readiness` / `npm run validate`: an absent
 * manifest means the workspace is developing on `[Unreleased]`, which must keep passing. Once a
 * manifest exists, it must be fully self-consistent -- a half-prepared or contradictory candidate
 * fails closed rather than being silently ignored.
 */
export function assessReleaseCandidateDevelopmentState(
  workspaceRoot: string,
): ReleaseCandidateAssessment {
  const { manifest, parseError } = loadReleaseCandidateManifest(workspaceRoot)
  if (parseError !== undefined) {
    return { status: 'FAIL', manifestPresent: true, findings: [parseError] }
  }
  if (manifest === undefined) {
    return { status: 'PASS', manifestPresent: false, findings: [] }
  }
  const findings = validateManifestConsistency(workspaceRoot, manifest)
  return {
    status: findings.length === 0 ? 'PASS' : 'FAIL',
    manifestPresent: true,
    findings,
  }
}

/**
 * Confirms the manifest's sourceCommitSha is the *exact* commit a formal verification run is
 * checking, not merely some commit that happens to exist somewhere in the repository's history --
 * a weaker "does this commit exist" check would let any old, unrelated, still-reachable SHA pass.
 * The convention this repository uses for final audit documents (see
 * docs/release/RELEASE_CANDIDATE_MANIFEST.md) is that the manifest's own commit never references
 * itself, so the accepted identity is either the current HEAD (the manifest committed alongside
 * the final code with nothing added afterward) or HEAD's direct parent (the manifest committed as
 * the very next commit after the validated code). Anything else -- including a stale SHA from an
 * earlier point in history -- fails closed. Pure so the git-independent comparison logic is
 * directly unit-testable; the CLI caller supplies `head`/`headParent` from a real `git rev-parse`.
 */
export function assessSourceCommitIdentity(
  sha: string,
  head: string | undefined,
  headParent: string | undefined,
): string | undefined {
  if (head === undefined) {
    return `Release candidate manifest sourceCommitSha "${sha}" cannot be verified: not running inside a git checkout`
  }
  if (sha === head || sha === headParent) return undefined
  return `Release candidate manifest sourceCommitSha "${sha}" is not the current HEAD (${head}) or its immediate parent -- it must reference the exact validated commit, not an arbitrary earlier one`
}

/**
 * Strict gate used by `npm run release:verify-candidate`: unlike the development-state gate, a
 * missing manifest is itself a finding -- a formal release candidate cannot be verified without
 * one having been prepared and committed.
 */
export function assessFormalReleaseCandidate(workspaceRoot: string): ReleaseCandidateAssessment {
  const { manifest, parseError } = loadReleaseCandidateManifest(workspaceRoot)
  if (parseError !== undefined) {
    return { status: 'FAIL', manifestPresent: true, findings: [parseError] }
  }
  if (manifest === undefined) {
    return {
      status: 'BLOCKED',
      manifestPresent: false,
      findings: [
        `No release candidate manifest found at ${RELEASE_CANDIDATE_MANIFEST_RELATIVE_PATH}. Formal release verification requires one to be prepared first.`,
      ],
    }
  }
  const findings = validateManifestConsistency(workspaceRoot, manifest)
  return {
    status: findings.length === 0 ? 'PASS' : 'FAIL',
    manifestPresent: true,
    findings,
  }
}
