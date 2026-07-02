import { runPreflight } from '../../forensics/preflight-runner.js'
import { renderPreflightReport } from '../../forensics/preflight-report.js'
import type { RuntimeToolContext, RuntimeToolDefinition } from '../types.js'

export interface PreflightToolInput {
  readonly changedFiles: readonly string[]
}

function parsePreflightInput(input: unknown): PreflightToolInput {
  if (typeof input !== 'object' || input === null) {
    throw new Error('Missing preflight input.')
  }

  const obj = input as Record<string, unknown>
  const changedFiles = obj['changedFiles']
  if (!Array.isArray(changedFiles) || !changedFiles.every((entry) => typeof entry === 'string')) {
    throw new Error('preflight requires "changedFiles" to be an array of strings.')
  }

  return { changedFiles: changedFiles as readonly string[] }
}

export const preflightTool: RuntimeToolDefinition = {
  name: 'preflight',
  description:
    'Run the PR preflight evidence pipeline against changed files through the sandboxed validation runner, producing a READY/NEEDS_WORK/BLOCKED verdict before pushing.',
  capability: 'PR_PREFLIGHT',
  execute: async (input: unknown, context: RuntimeToolContext): Promise<string> => {
    if (!context.policy.allowShell) {
      return 'Preflight command evidence collection requires shell execution to be allowed by policy.'
    }

    const parsed = parsePreflightInput(input)
    const report = await runPreflight(parsed.changedFiles, context.cwd, context.sandboxRunner)
    return renderPreflightReport(report)
  },
}
