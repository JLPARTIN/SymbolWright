import { renderRuntimeBoundary } from './runtime-renderers.js'

export interface PatchProposalFilePlan {
  readonly path: string
  readonly intent: string
}

export interface PatchProposal {
  readonly goal: string
  readonly files: readonly PatchProposalFilePlan[]
  readonly steps: readonly string[]
  readonly validation: readonly string[]
}

export function renderPatchProposal(proposal: PatchProposal): string {
  return [
    'CodeMind patch proposal',
    '',
    `Goal: ${proposal.goal}`,
    '',
    'Candidate files:',
    ...(proposal.files.length > 0
      ? proposal.files.map((file) => `- ${file.path}: ${file.intent}`)
      : ['- No candidate files inferred yet.']),
    '',
    'Proposed steps:',
    ...proposal.steps.map((step, index) => `${index + 1}. ${step}`),
    '',
    'Suggested validation:',
    ...proposal.validation.map((command) => `- ${command}`),
    '',
    'Proposal note:',
    '- This is a planning artifact only; no patch is applied.',
    '',
    renderRuntimeBoundary(),
  ].join('\n')
}
