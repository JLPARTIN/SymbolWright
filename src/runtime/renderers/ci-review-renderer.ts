import { renderRuntimeBoundary } from './runtime-renderers.js'

export interface CiReviewDraft {
  readonly source: string
  readonly status: string
  readonly findings: readonly string[]
  readonly nextSteps: readonly string[]
}

export function renderCiReviewDraft(draft: CiReviewDraft): string {
  return [
    'CodeMind CI review draft',
    '',
    `Source: ${draft.source}`,
    `Status: ${draft.status}`,
    '',
    'Findings:',
    ...(draft.findings.length > 0 ? draft.findings.map((item) => `- ${item}`) : ['- No findings provided.']),
    '',
    'Next steps:',
    ...draft.nextSteps.map((item, index) => `${index + 1}. ${item}`),
    '',
    'Review note:',
    '- This review is local and does not query CI services.',
    '',
    renderRuntimeBoundary(),
  ].join('\n')
}
