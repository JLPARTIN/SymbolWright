import path from 'node:path'

import {
  buildSecretScanReleaseEvidence,
  renderSecretScanReleaseEvidence,
  runContainerSecretScan,
  runGitHistorySecretScan,
  runNpmPackSecretScan,
  runSourceSecretScan,
  type SecretScanResult,
  type SecretScanSurface,
} from './release/secret-scan.js'

const surface = process.argv[2] as SecretScanSurface | undefined
const imageOverride = process.argv[3]
const workspaceRoot = path.resolve(process.cwd())

if (surface === undefined) {
  console.error('Usage: cli-secret-scan.js <source|git-history|npm-pack|container> [image]')
  process.exit(2)
}

const result = runSurface(surface)
const evidence = buildSecretScanReleaseEvidence(workspaceRoot, [result])
console.log(renderSecretScanReleaseEvidence(evidence))

if (evidence.overallStatus !== 'PASS') {
  process.exitCode = 1
}

function runSurface(target: SecretScanSurface): SecretScanResult {
  switch (target) {
    case 'source':
      return runSourceSecretScan(workspaceRoot)
    case 'git-history':
      return runGitHistorySecretScan(workspaceRoot)
    case 'npm-pack':
      return runNpmPackSecretScan(workspaceRoot)
    case 'container':
      return runContainerSecretScan(workspaceRoot, imageOverride)
    default:
      console.error(`Unknown secret scan surface: ${String(target)}`)
      process.exit(2)
  }
}
