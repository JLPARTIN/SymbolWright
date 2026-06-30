import { RELEASE_READINESS_SCRIPT } from './validation-planner.js'
import type {
  ChangedFileAnalysis,
  CommandResult,
  PrReadinessReport,
  PrReadinessVerdict,
  PushRecommendation,
  ValidationPlan,
} from './types.js'

function findResult(commands: readonly CommandResult[], script: string): CommandResult | undefined {
  return commands.find((item) => item.script === script)
}

function chooseVerdict(blockers: readonly string[], fixes: readonly string[]): PrReadinessVerdict {
  if (blockers.length > 0) return 'BLOCKED'
  if (fixes.length > 0) return 'NEEDS_WORK'
  return 'READY'
}

function choosePush(verdict: PrReadinessVerdict): PushRecommendation {
  return verdict === 'READY' ? 'SAFE_TO_PUSH' : 'DO_NOT_PUSH'
}

export function evaluatePreflightEvidence(
  changedFiles: readonly ChangedFileAnalysis[],
  plan: ValidationPlan,
  commands: readonly CommandResult[],
): PrReadinessReport {
  const blockers: string[] = []
  const fixes: string[] = []

  for (const script of plan.requiredScripts) {
    const result = findResult(commands, script)
    if (result === undefined) {
      blockers.push(`${script} was required but omitted`)
      continue
    }
    if (result.status === 'missing' || result.status === 'blocked' || result.status === 'skipped') {
      blockers.push(`${script} did not run`)
      continue
    }
    if (result.status === 'failed') {
      fixes.push(`${script} failed`)
    }
  }

  if (changedFiles.some((file) => file.forensicGates.length > 0)) {
    if (findResult(commands, RELEASE_READINESS_SCRIPT)?.status !== 'passed') {
      blockers.push(`${RELEASE_READINESS_SCRIPT} proof is required`)
    }
  }

  if (plan.failuresPrevented.includes('FORMAT_CHECK_FAILURE')) {
    if (findResult(commands, 'format:check')?.status !== 'passed') {
      fixes.push('format prevention proof is missing')
    }
  }

  const finalVerdict = chooseVerdict(blockers, fixes)
  const confidence =
    finalVerdict === 'READY' ? 100 : Math.max(0, 100 - blockers.length * 40 - fixes.length * 25)

  return {
    verdict: finalVerdict,
    confidence,
    changedFiles,
    validationCommands: commands,
    forensicGates: plan.forensicGates,
    failuresPrevented: plan.failuresPrevented,
    remainingRisks: [...blockers, ...fixes],
    pushRecommendation: choosePush(finalVerdict),
  }
}
