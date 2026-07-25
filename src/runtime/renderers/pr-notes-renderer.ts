import { renderRuntimeBoundary } from './runtime-renderers.js'

export interface PrNotesDraft {
  readonly title: string
  readonly summary: readonly string[]
  readonly validation: readonly string[]
  readonly limits: readonly string[]
}

export function renderPrNotesDraft(draft: PrNotesDraft): string {
  return [
    'SymbolWright PR notes draft',
    '',
    `Title: ${draft.title}`,
    '',
    'Summary:',
    ...draft.summary.map((item) => `- ${item}`),
    '',
    'Validation:',
    ...draft.validation.map((item) => `- ${item}`),
    '',
    'Limits:',
    ...draft.limits.map((item) => `- ${item}`),
    '',
    renderRuntimeBoundary(),
  ].join('\n')
}
