import {
  RUNTIME_BUILD_PHASES,
  getCompletedRuntimeBuildPhaseCount,
  getNextRuntimeBuildPhase,
  type RuntimeBuildPhase,
} from '../runtime/runtime-build-state.js'

export interface BuildLedgerEntry {
  readonly phaseId: string
  readonly title: string
  readonly state: 'COMPLETE' | 'NEXT'
  readonly commandCount: number
  readonly boundaryCount: number
}

export interface BuildLedgerSummary {
  readonly totalPhases: number
  readonly completedPhases: number
  readonly nextPhase: string | undefined
  readonly entries: readonly BuildLedgerEntry[]
  readonly generatedAt: string
}

export interface BuildLedgerConsistencyFinding {
  readonly source: string
  readonly issue: string
}

export type BuildLedgerConsistencyStatus = 'CONSISTENT' | 'INCONSISTENT'

export interface BuildLedgerConsistencyReport {
  readonly status: BuildLedgerConsistencyStatus
  readonly findings: readonly BuildLedgerConsistencyFinding[]
  readonly checkedAt: string
}

export function createBuildLedgerEntry(phase: RuntimeBuildPhase): BuildLedgerEntry {
  return {
    phaseId: phase.id,
    title: phase.title,
    state: phase.state,
    commandCount: phase.activeCommands.length,
    boundaryCount: phase.boundary.length,
  }
}

export function createBuildLedgerSummary(): BuildLedgerSummary {
  const nextPhase = getNextRuntimeBuildPhase()
  return {
    totalPhases: RUNTIME_BUILD_PHASES.length,
    completedPhases: getCompletedRuntimeBuildPhaseCount(),
    nextPhase: nextPhase !== undefined ? `Phase ${nextPhase.id} — ${nextPhase.title}` : undefined,
    entries: RUNTIME_BUILD_PHASES.map(createBuildLedgerEntry),
    generatedAt: new Date().toISOString(),
  }
}

export function checkBuildLedgerConsistency(
  readmeContent: string,
  runtimeDocsContent: string,
): BuildLedgerConsistencyReport {
  const findings: BuildLedgerConsistencyFinding[] = []
  const completedCount = getCompletedRuntimeBuildPhaseCount()
  const nextPhase = getNextRuntimeBuildPhase()

  const readmePhasePattern = /(\d+)\s+complete/
  const readmeMatch = readmePhasePattern.exec(readmeContent)
  if (readmeMatch !== null) {
    const readmeCount = parseInt(readmeMatch[1] ?? '0', 10)
    if (readmeCount !== completedCount) {
      findings.push({
        source: 'README.md',
        issue: `README claims ${readmeCount} completed phases but runtime has ${completedCount}`,
      })
    }
  } else if (!readmeContent.includes(`${completedCount} complete`)) {
    findings.push({
      source: 'README.md',
      issue: `README does not mention ${completedCount} completed phases`,
    })
  }

  for (const phase of RUNTIME_BUILD_PHASES) {
    if (phase.state === 'COMPLETE') {
      if (!runtimeDocsContent.includes(`Phase ${phase.id}: COMPLETE`)) {
        findings.push({
          source: 'docs/runtime/CODEMIND_RUNTIME_BUILD_STATE.md',
          issue: `Runtime docs missing Phase ${phase.id} as COMPLETE`,
        })
      }
    }
  }

  if (nextPhase === undefined) {
    if (runtimeDocsContent.includes('Next runtime phase') && !runtimeDocsContent.includes('none')) {
      const nextPhaseSection = runtimeDocsContent.split('Next runtime phase')[1]
      if (nextPhaseSection !== undefined && nextPhaseSection.includes('Phase')) {
        findings.push({
          source: 'docs/runtime/CODEMIND_RUNTIME_BUILD_STATE.md',
          issue: 'Runtime docs claim a next phase exists but all phases are complete',
        })
      }
    }
  }

  return {
    status: findings.length === 0 ? 'CONSISTENT' : 'INCONSISTENT',
    findings,
    checkedAt: new Date().toISOString(),
  }
}

export function renderBuildLedgerSummary(summary: BuildLedgerSummary): string {
  const lines = [
    'CodeMind Build Ledger',
    '',
    `Total phases: ${summary.totalPhases}`,
    `Completed: ${summary.completedPhases}`,
    `Next phase: ${summary.nextPhase ?? 'none'}`,
    `Generated: ${summary.generatedAt}`,
    '',
    'Phase ledger:',
    ...summary.entries.map(
      (e) =>
        `  Phase ${e.phaseId}: ${e.title} [${e.state}] (${e.commandCount} commands, ${e.boundaryCount} boundaries)`,
    ),
  ]
  return lines.join('\n')
}

export function renderBuildLedgerConsistencyReport(report: BuildLedgerConsistencyReport): string {
  const lines = [
    'Build Ledger Consistency Check',
    '',
    `Status: ${report.status}`,
    `Checked: ${report.checkedAt}`,
  ]

  if (report.findings.length > 0) {
    lines.push('', 'Findings:')
    for (const finding of report.findings) {
      lines.push(`  [${finding.source}] ${finding.issue}`)
    }
  }

  return lines.join('\n')
}
