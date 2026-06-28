import fs from 'node:fs'
import path from 'node:path'

import {
  createBuildLedgerSummary,
  renderBuildLedgerSummary,
  checkBuildLedgerConsistency,
  renderBuildLedgerConsistencyReport,
} from './build-state/codemind-build-ledger.js'

export function renderBuildLedgerCommand(workspaceRoot: string): string {
  const summary = createBuildLedgerSummary()
  const summaryOutput = renderBuildLedgerSummary(summary)

  let readmeContent = ''
  try {
    readmeContent = fs.readFileSync(path.join(workspaceRoot, 'README.md'), 'utf8')
  } catch {
    // README not found
  }

  let runtimeDocsContent = ''
  try {
    runtimeDocsContent = fs.readFileSync(
      path.join(workspaceRoot, 'docs/runtime/CODEMIND_RUNTIME_BUILD_STATE.md'),
      'utf8',
    )
  } catch {
    // Runtime docs not found
  }

  const consistency = checkBuildLedgerConsistency(readmeContent, runtimeDocsContent)
  const consistencyOutput = renderBuildLedgerConsistencyReport(consistency)

  return [summaryOutput, '', consistencyOutput].join('\n')
}
