import type { GoalPlan, GoalPlanStep, RuntimeToolContext, RuntimeToolDefinition } from '../types.js'
import { renderRuntimeBoundary } from '../renderers/runtime-renderers.js'

export interface PlanGoalInput {
  readonly goal: string
}

function parsePlanGoalInput(input: unknown): PlanGoalInput {
  if (typeof input !== 'object' || input === null || !('goal' in input)) {
    throw new Error('Missing goal: codemind plan <goal>')
  }

  const goal = (input as { readonly goal: unknown }).goal
  if (typeof goal !== 'string') {
    throw new Error('Missing goal: codemind plan <goal>')
  }

  return { goal }
}

export function buildGoalPlan(goal: string): GoalPlan {
  const trimmedGoal = goal.trim()
  if (trimmedGoal.length === 0) {
    throw new Error('Missing goal: codemind plan <goal>')
  }

  const steps: readonly GoalPlanStep[] = [
    {
      id: 'context',
      title: 'Confirm context',
      detail:
        'Review the repository state, relevant docs, and active safety policy before proposing work.',
    },
    {
      id: 'scope',
      title: 'Define smallest safe scope',
      detail: 'Identify the smallest read-only file set and command surface needed for the goal.',
      dependsOn: ['context'],
    },
    {
      id: 'plan',
      title: 'Draft implementation plan',
      detail:
        'Describe implementation steps before any patch proposal or approved edit path is used.',
      dependsOn: ['scope'],
    },
    {
      id: 'validation',
      title: 'Prepare validation plan',
      detail: 'List validation commands for operator review without executing them.',
      dependsOn: ['plan'],
    },
  ]

  return { goal: trimmedGoal, steps }
}

export function renderGoalPlan(plan: GoalPlan): string {
  return [
    'CodeMind runtime plan',
    '',
    `Goal: ${plan.goal}`,
    '',
    'Steps:',
    ...plan.steps.map((step, index) => {
      const dependency =
        step.dependsOn === undefined ? '' : ` Depends on: ${step.dependsOn.join(', ')}.`
      return `${index + 1}. ${step.title} — ${step.detail}${dependency}`
    }),
    '',
    renderRuntimeBoundary(),
  ].join('\n')
}

export async function executePlanGoalTool(
  input: PlanGoalInput,
  _context: RuntimeToolContext,
): Promise<string> {
  return renderGoalPlan(buildGoalPlan(input.goal))
}

export const planGoalTool: RuntimeToolDefinition = {
  name: 'plan_goal',
  description: 'Render a non-mutating runtime plan for an operator goal.',
  capability: 'PLAN',
  execute: async (input, context) => executePlanGoalTool(parsePlanGoalInput(input), context),
}
