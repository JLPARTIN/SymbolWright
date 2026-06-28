import type { LocalFileWriteDiff } from './local-file-write-diff.js'
import type { LocalFileWriteGateResult } from './local-file-write-gate.js'

export type LocalFileWriteOutcome = 'WRITTEN' | 'DRY_RUN' | 'BLOCKED'

export interface LocalFileWriteExecutionResult {
  readonly outcome: LocalFileWriteOutcome
  readonly gateResult: LocalFileWriteGateResult
  readonly diff: LocalFileWriteDiff | null
  readonly rollbackNote: string
  readonly error: string | null
}

export function renderLocalFileWriteExecutionResult(result: LocalFileWriteExecutionResult): string {
  const lines: string[] = [
    'CodeMind local file write execution',
    '',
    `Outcome: ${result.outcome}`,
    `Target: ${result.gateResult.targetPath}`,
    `Reason: ${result.gateResult.reason}`,
    `Rollback: ${result.rollbackNote}`,
  ]

  if (result.outcome === 'BLOCKED') {
    lines.push('', 'Block reasons:')
    lines.push(...result.gateResult.blockReasons.map((reason) => `- ${reason}`))
  }

  if (result.outcome === 'DRY_RUN') {
    lines.push('', 'Dry-run preview: write would be allowed.', 'No file has been modified.')
  }

  if (result.outcome === 'WRITTEN') {
    lines.push(
      '',
      `File ${result.diff?.isNew ? 'created' : 'updated'}: ${result.gateResult.resolvedPath}`,
      'Write applied successfully.',
    )
  }

  if (result.error !== null) {
    lines.push('', `Error: ${result.error}`)
  }

  return lines.join('\n')
}
