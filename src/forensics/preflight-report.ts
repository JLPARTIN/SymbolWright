import { classifyChangedFiles } from './file-classifier.js'
import { collectCommandEvidence, type ScriptEvidenceProvider } from './command-evidence.js'
import { matchFailureLedgerRules } from './failure-ledger.js'
import { evaluatePreflightEvidence } from './readiness-evaluator.js'
import { planValidation } from './validation-planner.js'
import type { FailureLedger, PackageManager, PreflightInput, PrReadinessReport } from './types.js'

export interface PreflightReportInput extends PreflightInput {
  readonly ledger: FailureLedger
  readonly packageManager: PackageManager
  readonly availableScripts: ReadonlySet<string>
}

export async function buildPreflightReport(
  input: PreflightReportInput,
  evidenceProvider: ScriptEvidenceProvider,
): Promise<PrReadinessReport> {
  const changedFiles = classifyChangedFiles(input.changedFiles)
  const matches = matchFailureLedgerRules(input.ledger, input.changedFiles)
  const plan = planValidation(changedFiles, matches)
  const commands = await collectCommandEvidence(
    input.repoRoot,
    input.packageManager,
    plan.requiredScripts,
    input.availableScripts,
    evidenceProvider,
  )

  return evaluatePreflightEvidence(changedFiles, plan, commands)
}
