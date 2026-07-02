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

export function renderPreflightReport(report: PrReadinessReport): string {
  const lines = [
    'CodeMind PR Preflight',
    '',
    `Verdict: ${report.verdict}`,
    `Confidence: ${report.confidence}`,
    `Push recommendation: ${report.pushRecommendation}`,
  ]

  if (report.changedFiles.length > 0) {
    lines.push('', 'Changed files:')
    for (const file of report.changedFiles) {
      lines.push(`  ${file.normalizedPath} (${file.kind}, risk=${file.riskLevel})`)
    }
  }

  if (report.validationCommands.length > 0) {
    lines.push('', 'Validation commands:')
    for (const command of report.validationCommands) {
      const reason = command.reason !== undefined ? ` — ${command.reason}` : ''
      lines.push(`  [${command.status.toUpperCase()}] ${command.command}${reason}`)
    }
  }

  if (report.forensicGates.length > 0) {
    lines.push('', 'Forensic gates triggered:')
    for (const gate of report.forensicGates) {
      lines.push(`  - ${gate}`)
    }
  }

  if (report.failuresPrevented.length > 0) {
    lines.push('', 'Prevented recurring failures:')
    for (const failureClass of report.failuresPrevented) {
      lines.push(`  - ${failureClass}`)
    }
  }

  if (report.remainingRisks.length > 0) {
    lines.push('', 'Remaining risks:')
    for (const risk of report.remainingRisks) {
      lines.push(`  - ${risk}`)
    }
  }

  return lines.join('\n')
}
