import type { RuntimeToolContext, RuntimeToolDefinition } from '../types.js'
import { renderRuntimeBoundary } from '../renderers/runtime-renderers.js'

export interface ValidationPlanInput {
  readonly focus?: string
}

export async function executeValidationPlanTool(
  input: ValidationPlanInput,
  _context: RuntimeToolContext,
): Promise<string> {
  const focus = input.focus?.trim() || 'current repository change'
  const commands = [
    'npm run typecheck',
    'npm test',
    'npm run test:coverage',
    'npm run lint',
    'npm run audit',
    'npm run build',
  ]

  return [
    'CodeMind validation plan',
    '',
    `Focus: ${focus}`,
    '',
    'Recommended command sequence:',
    ...commands.map((command, index) => `${index + 1}. ${command}`),
    '',
    'Execution note:',
    '- This command only prints validation guidance; it does not run commands.',
    '',
    renderRuntimeBoundary(),
  ].join('\n')
}

export const validationPlanTool: RuntimeToolDefinition<ValidationPlanInput> = {
  name: 'validation_plan',
  description: 'Render validation guidance without executing commands.',
  capability: 'VALIDATE',
  execute: executeValidationPlanTool,
}
