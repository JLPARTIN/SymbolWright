import path from 'node:path'

import { assessReleaseClosureIntegrity } from './release/release-closure-integrity.js'

const workspaceRoot = path.resolve(process.cwd())
const report = assessReleaseClosureIntegrity(workspaceRoot)

console.log('SymbolWright Release Closure Integrity')
console.log('')
console.log(`Outcome: ${report.status}`)

if (report.findings.length === 0) {
  console.log('Findings: none')
} else {
  console.log('Findings:')
  for (const finding of report.findings) {
    console.log(`  - ${finding}`)
  }
}

if (report.status === 'FAIL') {
  process.exitCode = 1
}
