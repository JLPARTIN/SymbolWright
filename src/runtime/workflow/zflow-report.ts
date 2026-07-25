import type { ZflowHandoffPacket, ZflowReadinessSummary } from './zflow-handoff.js'
import type { ZflowResult } from './zflow-workflow.js'

export interface ZflowExecutionReport {
  readonly id: string
  readonly generatedAt: string
  readonly result: ZflowResult
  readonly readiness: ZflowReadinessSummary
  readonly sections: readonly ZflowReportSection[]
}

export interface ZflowReportSection {
  readonly title: string
  readonly body: string
}

export interface ZflowReportSnapshot {
  readonly id: string
  readonly generatedAt: string
  readonly mode: string
  readonly localResult: string
  readonly readiness: string
  readonly reasonCount: number
  readonly hasPrOutput: boolean
  readonly hasCollaborationOutput: boolean
  readonly hasRecoveryOutput: boolean
  readonly hasRollbackOutput: boolean
}

export function createZflowExecutionReport(input: {
  readonly id: string
  readonly result: ZflowResult
  readonly handoff: ZflowHandoffPacket
  readonly generatedAt?: string
}): ZflowExecutionReport {
  return {
    id: input.id,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    result: input.result,
    readiness: input.handoff.summary,
    sections: [
      {
        title: 'Local result',
        body: input.result.localOutput,
      },
      {
        title: 'PR output',
        body: input.result.prOutput ?? 'Not requested.',
      },
      {
        title: 'Collaboration output',
        body: input.result.collaborationOutput ?? 'Not requested.',
      },
      {
        title: 'Recovery output',
        body: input.result.recoveryOutput,
      },
      {
        title: 'Rollback output',
        body: input.result.rollbackOutput,
      },
    ],
  }
}

export function createZflowReportSnapshot(report: ZflowExecutionReport): ZflowReportSnapshot {
  return {
    id: report.id,
    generatedAt: report.generatedAt,
    mode: report.result.mode,
    localResult: report.result.localOutput,
    readiness: report.readiness.readiness,
    reasonCount: report.readiness.reasons.length,
    hasPrOutput: report.result.prOutput !== null,
    hasCollaborationOutput: report.result.collaborationOutput !== null,
    hasRecoveryOutput: report.result.recoveryOutput.trim().length > 0,
    hasRollbackOutput: report.result.rollbackOutput.trim().length > 0,
  }
}

export function renderZflowReportMarkdown(report: ZflowExecutionReport): string {
  return [
    `# SymbolWright Zflow Execution Report`,
    '',
    `Report ID: ${report.id}`,
    `Generated: ${report.generatedAt}`,
    `Mode: ${report.result.mode}`,
    `Local result: ${report.result.localOutput}`,
    `Readiness: ${report.readiness.readiness}`,
    '',
    '## Readiness reasons',
    '',
    ...report.readiness.reasons.map((reason) => `- ${reason}`),
    '',
    ...report.sections.flatMap((section) => [`## ${section.title}`, '', section.body, '']),
    '## Boundary',
    '',
    '- Reporting/export only.',
    '- No live GitHub mutation by default.',
    '- No rollback execution.',
  ].join('\n')
}

export function renderZflowReportJson(report: ZflowExecutionReport): string {
  return JSON.stringify(
    {
      report: createZflowReportSnapshot(report),
      sections: report.sections,
    },
    null,
    2,
  )
}
