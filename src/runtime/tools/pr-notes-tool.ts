import type { RuntimeToolContext, RuntimeToolDefinition } from '../types.js'
import { renderPrNotesDraft, type PrNotesDraft } from '../renderers/pr-notes-renderer.js'

export interface PrNotesInput {
  readonly title?: string
  readonly focus?: string
}

function parsePrNotesInput(input: unknown): PrNotesInput {
  const value = typeof input === 'object' && input !== null ? (input as Record<string, unknown>) : {}
  const parsed: { title?: string; focus?: string } = {}

  if (typeof value['title'] === 'string') {
    parsed.title = value['title']
  }
  if (typeof value['focus'] === 'string') {
    parsed.focus = value['focus']
  }

  return parsed
}

export function buildPrNotesDraft(input: PrNotesInput): PrNotesDraft {
  const focus = input.focus?.trim() || 'current proposal bundle'
  const title = input.title?.trim() || `proposal: ${focus}`

  return {
    title,
    summary: [
      `Prepared operator notes for ${focus}.`,
      'Kept output proposal-only and reviewable before any execution gate.',
      'Documented validation commands for follow-up review.',
    ],
    validation: [
      'npm run typecheck',
      'npm test',
      'npm run lint',
    ],
    limits: [
      'No PR comment is posted.',
      'No approval is requested.',
      'No merge action is performed.',
    ],
  }
}

export async function executePrNotesTool(
  input: PrNotesInput,
  _context: RuntimeToolContext,
): Promise<string> {
  return renderPrNotesDraft(buildPrNotesDraft(input))
}

export const prNotesTool: RuntimeToolDefinition = {
  name: 'pr_notes',
  description: 'Draft PR notes without posting them.',
  capability: 'DRAFT_NOTES',
  execute: async (input, context) => executePrNotesTool(parsePrNotesInput(input), context),
}
