import { execFileSync } from 'node:child_process'
import path from 'node:path'

import {
  RELEASE_CANDIDATE_MANIFEST_RELATIVE_PATH,
  assessFormalReleaseCandidate,
  loadReleaseCandidateManifest,
} from './release/release-candidate.js'

const workspaceRoot = path.resolve(process.cwd())
const report = assessFormalReleaseCandidate(workspaceRoot)
const findings = [...report.findings]
let status: 'PASS' | 'FAIL' | 'BLOCKED' = report.status

if (report.manifestPresent && report.status === 'PASS') {
  const { manifest } = loadReleaseCandidateManifest(workspaceRoot)
  const staleness =
    manifest === undefined ? undefined : checkCommitReachable(manifest.sourceCommitSha)
  if (staleness !== undefined) {
    findings.push(staleness)
    status = 'FAIL'
  }
}

console.log('SymbolWright Release Candidate Verification')
console.log('')
console.log(`Manifest: ${RELEASE_CANDIDATE_MANIFEST_RELATIVE_PATH}`)
console.log(`Outcome: ${status}`)

if (findings.length === 0) {
  console.log('Findings: none')
} else {
  console.log('Findings:')
  for (const finding of findings) {
    console.log(`  - ${finding}`)
  }
}

if (status !== 'PASS') {
  process.exitCode = 1
}

/**
 * Best-effort: confirms the manifest's sourceCommitSha is a real, reachable commit in this
 * repository's history rather than a stale, malformed, or fabricated value. Only meaningful when
 * run inside an actual git checkout; a missing `.git` directory or unreachable SHA both surface as
 * the same finding since either way the claim cannot be trusted.
 */
function checkCommitReachable(sha: string): string | undefined {
  try {
    execFileSync('git', ['cat-file', '-e', `${sha}^{commit}`], {
      cwd: workspaceRoot,
      stdio: 'ignore',
    })
    return undefined
  } catch {
    return `Release candidate manifest sourceCommitSha "${sha}" is not a reachable commit in this repository's history`
  }
}
