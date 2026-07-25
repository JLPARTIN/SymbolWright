export interface SymbolWrightPlan {
  readonly goal: string
  readonly posture: readonly string[]
  readonly steps: readonly string[]
  readonly validation: readonly string[]
  readonly boundary: readonly string[]
}

export function buildSymbolWrightPlan(goal: string): SymbolWrightPlan {
  const trimmedGoal = goal.trim()
  if (trimmedGoal.length === 0) {
    throw new Error('Missing goal: symbolwright plan <goal>')
  }

  return {
    goal: trimmedGoal,
    posture: ['read-only', 'plan-first', 'operator-approved changes only'],
    steps: [
      'Confirm repository context and current branch before implementation.',
      'Identify the smallest safe file set for the requested goal.',
      'Draft a proposed patch plan before editing files.',
      'List validation commands before running them.',
      'Keep write actions behind explicit operator approval.',
    ],
    validation: [
      'npm run typecheck',
      'npm test',
      'npm run test:coverage',
      'npm run lint',
      'npm run build',
    ],
    boundary: [
      'does not edit files',
      'does not run shell commands',
      'does not call providers',
      'does not post PR comments',
      'does not mutate GitHub state',
    ],
  }
}

export function renderSymbolWrightPlan(goal: string): string {
  const plan = buildSymbolWrightPlan(goal)

  return [
    'SymbolWright plan',
    '',
    `Goal: ${plan.goal}`,
    '',
    'Posture:',
    ...plan.posture.map((item) => `- ${item}`),
    '',
    'Implementation steps:',
    ...plan.steps.map((step, index) => `${index + 1}. ${step}`),
    '',
    'Suggested validation:',
    ...plan.validation.map((command) => `- ${command}`),
    '',
    'Boundary:',
    ...plan.boundary.map((item) => `- ${item}`),
  ].join('\n')
}
