import { execFileSync } from 'node:child_process'
import path from 'node:path'

import {
  RELEASE_CANDIDATE_MANIFEST_RELATIVE_PATH,
  assessFormalReleaseCandidate,
  assessSourceCommitIdentity,
  loadReleaseCandidateManifest,
} from './release/release-candidate.js'

const workspaceRoot = path.resolve(process.cwd())
const report = assessFormalReleaseCandidate(workspaceRoot)
const findings = [...report.findings]
let status: 'PASS' | 'FAIL' | 'BLOCKED' = report.status

if (report.manifestPresent && report.status === 'PASS') {
  const { manifest } = loadReleaseCandidateManifest(workspaceRoot)
  const identityFinding =
    manifest === undefined
      ? undefined
      : assessSourceCommitIdentity(
          manifest.sourceCommitSha,
          gitRevParse('HEAD'),
          gitRevParse('HEAD^'),
        )
  if (identityFinding !== undefined) {
    findings.push(identityFinding)
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

function gitRevParse(ref: string): string | undefined {
  try {
    return execFileSync('git', ['rev-parse', ref], { cwd: workspaceRoot, encoding: 'utf8' }).trim()
  } catch {
    return undefined
  }
}
