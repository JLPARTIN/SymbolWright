import type { RecoveryChangeRecord } from './change-ledger.js'

export interface RollbackPlanStep {
  readonly id: string
  readonly targetPath: string
  readonly instruction: string
}

export interface RollbackPlan {
  readonly title: string
  readonly steps: readonly RollbackPlanStep[]
}

function instructionFor(record: RecoveryChangeRecord): string {
  if (record.kind === 'created') {
    return `Remove ${record.targetPath}. ${record.rollbackNote}`
  }

  if (record.kind === 'deleted') {
    return `Restore ${record.targetPath} from previous content. ${record.rollbackNote}`
  }

  return `Restore previous content for ${record.targetPath}. ${record.rollbackNote}`
}

export function createRollbackPlan(
  title: string,
  records: readonly RecoveryChangeRecord[],
): RollbackPlan {
  return {
    title,
    steps: records.map((record) => ({
      id: record.id,
      targetPath: record.targetPath,
      instruction: instructionFor(record),
    })),
  }
}

export function renderRollbackPlan(plan: RollbackPlan): string {
  if (plan.steps.length === 0) {
    return [`Rollback plan: ${plan.title}`, '', 'No rollback steps required.'].join('\n')
  }

  return [
    `Rollback plan: ${plan.title}`,
    '',
    ...plan.steps.flatMap((step, index) => [
      `${index + 1}. ${step.targetPath}`,
      `   ${step.instruction}`,
    ]),
  ].join('\n')
}
