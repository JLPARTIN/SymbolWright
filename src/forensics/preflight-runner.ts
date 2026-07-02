import { readFileSync } from 'node:fs'
import path from 'node:path'

import type { SandboxRunner } from '../runtime/sandbox/sandbox-runner.js'
import { loadFailureLedger } from './failure-ledger.js'
import { detectPackageManager } from './package-manager.js'
import { buildPreflightReport } from './preflight-report.js'
import { createSandboxScriptEvidenceProvider } from './sandbox-evidence-provider.js'
import type { FailureLedger, PrReadinessReport } from './types.js'

const EMPTY_LEDGER: FailureLedger = { schemaVersion: 1, failures: [] }

function readAvailableScripts(repoRoot: string): ReadonlySet<string> {
  const packageJsonPath = path.join(repoRoot, 'package.json')
  try {
    const raw = JSON.parse(readFileSync(packageJsonPath, 'utf-8')) as {
      readonly scripts?: Record<string, string>
    }
    return new Set(Object.keys(raw.scripts ?? {}))
  } catch {
    return new Set()
  }
}

/**
 * Assembles the ledger, package manager, and available-scripts evidence, then runs the
 * preflight pipeline with command evidence bound to the zero-trust sandbox runner.
 */
export async function runPreflight(
  changedFiles: readonly string[],
  repoRoot: string,
  sandboxRunner?: SandboxRunner,
): Promise<PrReadinessReport> {
  const ledgerResult = loadFailureLedger(repoRoot)
  const ledger =
    ledgerResult.ok && ledgerResult.ledger !== undefined ? ledgerResult.ledger : EMPTY_LEDGER

  const packageManager = detectPackageManager(repoRoot)
  const availableScripts = readAvailableScripts(repoRoot)
  const evidenceProvider = createSandboxScriptEvidenceProvider(sandboxRunner)

  return buildPreflightReport(
    { repoRoot, changedFiles, ledger, packageManager, availableScripts },
    evidenceProvider,
  )
}
