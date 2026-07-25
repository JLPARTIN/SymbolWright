export const SYMBOLWRIGHT_PROOF_REPORT_RENDERER_BLOCK_ID = 'SYMBOLWRIGHT-PROOF-HARNESS-08' as const
export const SYMBOLWRIGHT_PROOF_REPORT_RENDERER_PR_ID = 'PR-CM-TEST-08' as const
export const SYMBOLWRIGHT_PROOF_REPORT_RENDERER_PHASE_ID = 'SYMBOLWRIGHT-TEST-08' as const

export const SYMBOLWRIGHT_PROOF_RENDER_FORMATS = ['plain', 'markdown', 'compact'] as const
export type SymbolWrightProofRenderFormat = (typeof SYMBOLWRIGHT_PROOF_RENDER_FORMATS)[number]

/**
 * Minimal shape shared by every SYMBOLWRIGHT-PROOF-HARNESS-* report.
 * Structurally compatible with all concrete proof report types.
 */
export interface SymbolWrightProofReportBase {
  readonly blockId: string
  readonly prId: string
  readonly phaseId: string
  readonly status: string
  readonly summary: string
  readonly mutationAllowed?: false
  readonly githubWriteAllowed?: false
  readonly providerInvocationAllowed?: false
  /** Any collection named *Notes, *Findings, *Violations, *Errors, *Gates. */
  readonly blockingNotes?: readonly string[]
  readonly flagViolations?: readonly string[]
  readonly replayErrors?: readonly string[]
  readonly missingSpecs?: readonly string[]
  readonly missingBlockIds?: readonly string[]
  readonly missingGates?: readonly string[]
  readonly violations?: readonly string[]
}

export interface SymbolWrightProofRenderInput {
  readonly report: SymbolWrightProofReportBase
  readonly format: SymbolWrightProofRenderFormat
  /** ISO timestamp string — omit for deterministic/timestamp-free output. */
  readonly renderedAt?: string
}

export interface SymbolWrightProofRenderOutput {
  readonly blockId: typeof SYMBOLWRIGHT_PROOF_REPORT_RENDERER_BLOCK_ID
  readonly prId: typeof SYMBOLWRIGHT_PROOF_REPORT_RENDERER_PR_ID
  readonly phaseId: typeof SYMBOLWRIGHT_PROOF_REPORT_RENDERER_PHASE_ID
  readonly format: SymbolWrightProofRenderFormat
  readonly text: string
  readonly lineCount: number
  readonly mutationAllowed: false
  readonly githubWriteAllowed: false
  readonly providerInvocationAllowed: false
}

function collectIssues(report: SymbolWrightProofReportBase): readonly string[] {
  return [
    ...(report.blockingNotes ?? []),
    ...(report.flagViolations ?? []),
    ...(report.replayErrors ?? []),
    ...(report.missingSpecs ?? []),
    ...(report.missingBlockIds ?? []),
    ...(report.missingGates ?? []),
    ...(report.violations ?? []),
  ]
}

function renderInvariants(report: SymbolWrightProofReportBase): readonly string[] {
  const lines: string[] = []
  if (report.mutationAllowed !== undefined) {
    lines.push(`mutationAllowed: ${String(report.mutationAllowed)}`)
  }
  if (report.githubWriteAllowed !== undefined) {
    lines.push(`githubWriteAllowed: ${String(report.githubWriteAllowed)}`)
  }
  if (report.providerInvocationAllowed !== undefined) {
    lines.push(`providerInvocationAllowed: ${String(report.providerInvocationAllowed)}`)
  }
  return lines
}

function buildPlainLines(
  report: SymbolWrightProofReportBase,
  renderedAt?: string,
): readonly string[] {
  const issues = collectIssues(report)
  const invariants = renderInvariants(report)

  const lines: string[] = [
    `Block:   ${report.blockId}`,
    `PR:      ${report.prId}`,
    `Phase:   ${report.phaseId}`,
    `Status:  ${report.status}`,
    `Summary: ${report.summary}`,
  ]

  if (renderedAt !== undefined) {
    lines.push(`Rendered: ${renderedAt}`)
  }

  if (invariants.length > 0) {
    lines.push('', 'Runtime invariants:')
    invariants.forEach((inv) => lines.push(`  ${inv}`))
  }

  if (issues.length > 0) {
    lines.push('', 'Issues:')
    issues.forEach((issue) => lines.push(`  - ${issue}`))
  }

  lines.push('', 'Validation:', '  npm run typecheck', '  npm test', '  npm run build')

  return lines
}

function buildMarkdownLines(
  report: SymbolWrightProofReportBase,
  renderedAt?: string,
): readonly string[] {
  const issues = collectIssues(report)
  const invariants = renderInvariants(report)

  const lines: string[] = [
    `## ${report.blockId}`,
    '',
    `**PR:** ${report.prId}  `,
    `**Phase:** ${report.phaseId}  `,
    `**Status:** \`${report.status}\`  `,
    `**Summary:** ${report.summary}  `,
  ]

  if (renderedAt !== undefined) {
    lines.push(`**Rendered:** ${renderedAt}  `)
  }

  if (invariants.length > 0) {
    lines.push('', '### Runtime Invariants', '')
    invariants.forEach((inv) => lines.push(`- \`${inv}\``))
  }

  if (issues.length > 0) {
    lines.push('', '### Issues', '')
    issues.forEach((issue) => lines.push(`- ${issue}`))
  }

  lines.push(
    '',
    '### Validation',
    '',
    '```bash',
    'npm run typecheck',
    'npm test',
    'npm run build',
    '```',
  )

  return lines
}

function buildCompactLine(report: SymbolWrightProofReportBase): string {
  return `[${report.status}] ${report.blockId} | ${report.prId} | ${report.summary}`
}

export function renderSymbolWrightProofReport(
  input: SymbolWrightProofRenderInput,
): SymbolWrightProofRenderOutput {
  let lines: readonly string[]

  switch (input.format) {
    case 'plain':
      lines = buildPlainLines(input.report, input.renderedAt)
      break
    case 'markdown':
      lines = buildMarkdownLines(input.report, input.renderedAt)
      break
    case 'compact':
      lines = [buildCompactLine(input.report)]
      break
  }

  const text = lines.join('\n')

  return {
    blockId: SYMBOLWRIGHT_PROOF_REPORT_RENDERER_BLOCK_ID,
    prId: SYMBOLWRIGHT_PROOF_REPORT_RENDERER_PR_ID,
    phaseId: SYMBOLWRIGHT_PROOF_REPORT_RENDERER_PHASE_ID,
    format: input.format,
    text,
    lineCount: lines.length,
    mutationAllowed: false,
    githubWriteAllowed: false,
    providerInvocationAllowed: false,
  }
}
