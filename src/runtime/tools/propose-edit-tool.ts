import type { RuntimeToolContext, RuntimeToolDefinition } from '../types.js'
import { renderPatchProposal, type PatchProposal } from '../renderers/patch-proposal-renderer.js'

export interface ProposeEditInput {
  readonly goal: string
}

function parseProposeEditInput(input: unknown): ProposeEditInput {
  if (typeof input !== 'object' || input === null || !('goal' in input)) {
    throw new Error('Missing goal: codemind propose-patch <goal>')
  }

  const goal = (input as { readonly goal: unknown }).goal
  if (typeof goal !== 'string') {
    throw new Error('Missing goal: codemind propose-patch <goal>')
  }

  return { goal }
}

export function buildPatchProposal(goal: string): PatchProposal {
  const trimmedGoal = goal.trim()
  if (trimmedGoal.length === 0) {
    throw new Error('Missing goal: codemind propose-patch <goal>')
  }

  return {
    goal: trimmedGoal,
    files: [
      { path: 'src/', intent: 'Inspect relevant source files before proposing concrete edits.' },
      { path: 'docs/', intent: 'Update operator-facing docs if the proposed behavior changes.' },
      { path: 'tests', intent: 'Add or update tests that prove the proposed behavior.' },
    ],
    steps: [
      'Confirm the current read-only runtime context.',
      'Identify the smallest safe file set for the requested goal.',
      'Draft the patch shape as a proposal without applying file changes.',
      'List validation commands for operator approval.',
      'Hand off to approved execution gates in a later phase if edits are accepted.',
    ],
    validation: [
      'npm run typecheck',
      'npm test',
      'npm run test:coverage',
      'npm run lint',
      'npm run build',
    ],
  }
}

export async function executeProposeEditTool(
  input: ProposeEditInput,
  _context: RuntimeToolContext,
): Promise<string> {
  return renderPatchProposal(buildPatchProposal(input.goal))
}

export const proposeEditTool: RuntimeToolDefinition = {
  name: 'propose_edit',
  description: 'Render a patch proposal without applying changes.',
  capability: 'PROPOSE',
  execute: async (input, context) => executeProposeEditTool(parseProposeEditInput(input), context),
}
