import type { GoalPlan } from '../types.js'

export function assertValidGoalPlan(plan: unknown): asserts plan is GoalPlan {
  if (typeof plan !== 'object' || plan === null) {
    throw new Error('GoalPlan must be a non-null object')
  }

  const p = plan as Record<string, unknown>

  if (typeof p['goal'] !== 'string' || (p['goal'] as string).trim().length === 0) {
    throw new Error('GoalPlan.goal must be a non-empty string')
  }

  if (!Array.isArray(p['steps'])) {
    throw new Error('GoalPlan.steps must be an array')
  }

  const stepIds = new Set<string>()

  for (const step of p['steps'] as unknown[]) {
    if (typeof step !== 'object' || step === null) {
      throw new Error('Each GoalPlanStep must be a non-null object')
    }

    const s = step as Record<string, unknown>

    if (typeof s['id'] !== 'string' || (s['id'] as string).trim().length === 0) {
      throw new Error('GoalPlanStep.id must be a non-empty string')
    }

    if (stepIds.has(s['id'] as string)) {
      throw new Error(`Duplicate step id: ${s['id'] as string}`)
    }
    stepIds.add(s['id'] as string)

    if (typeof s['title'] !== 'string' || (s['title'] as string).trim().length === 0) {
      throw new Error('GoalPlanStep.title must be a non-empty string')
    }

    if (typeof s['detail'] !== 'string') {
      throw new Error('GoalPlanStep.detail must be a string')
    }

    if (s['dependsOn'] !== undefined) {
      if (!Array.isArray(s['dependsOn'])) {
        throw new Error('GoalPlanStep.dependsOn must be an array')
      }

      for (const dep of s['dependsOn'] as unknown[]) {
        if (typeof dep !== 'string') {
          throw new Error('Each dependsOn entry must be a string')
        }
      }
    }
  }

  const allIds = stepIds
  for (const step of p['steps'] as Record<string, unknown>[]) {
    if (step['dependsOn'] !== undefined) {
      for (const dep of step['dependsOn'] as string[]) {
        if (!allIds.has(dep)) {
          throw new Error(`Step "${step['id'] as string}" depends on unknown step: ${dep}`)
        }
      }
    }
  }
}
