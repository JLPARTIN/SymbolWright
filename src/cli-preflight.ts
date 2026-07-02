import { renderPreflightReport } from './forensics/preflight-report.js'
import { runPreflight } from './forensics/preflight-runner.js'

export interface PreflightCommandResult {
  readonly output: string
  /** True when the verdict is NEEDS_WORK or BLOCKED and the caller should fail/exit non-zero. */
  readonly blocking: boolean
}

export async function runPreflightCommand(
  changedFiles: readonly string[],
  cwd: string = process.cwd(),
): Promise<PreflightCommandResult> {
  if (changedFiles.length === 0) {
    return {
      output: [
        'CodeMind PR Preflight',
        '',
        'Verdict: READY',
        'Confidence: 100',
        'Push recommendation: SAFE_TO_PUSH',
        '',
        'No changed files were provided; nothing to preflight.',
      ].join('\n'),
      blocking: false,
    }
  }

  const report = await runPreflight(changedFiles, cwd)
  return {
    output: renderPreflightReport(report),
    blocking: report.verdict === 'BLOCKED' || report.verdict === 'NEEDS_WORK',
  }
}
