import type { AjnaMergeGateResult } from '../../ajna/ajna-merge-gate.js'
import type { AjnaLiveReviewInput } from '../../ajna/ajna-live-review.js'
import { evaluateAjnaMergeGate } from '../../ajna/ajna-merge-gate.js'
import type { CodemindChangedFileContext } from '../../repo-context/repo-context.types.js'

export type PrWorkflowStage =
  | 'INVESTIGATE'
  | 'IMPLEMENT'
  | 'VALIDATE'
  | 'REVIEW'
  | 'PREPARE_PR'
  | 'COMPLETED'
  | 'BLOCKED'

export interface PrWorkflowState {
  readonly stage: PrWorkflowStage
  readonly repository: string
  readonly headRef: string
  readonly baseRef: string
  readonly headSha: string
  readonly baseSha: string
  readonly changedFiles: readonly CodemindChangedFileContext[]
  readonly ajnaGateResult: AjnaMergeGateResult | undefined
  readonly blockReasons: readonly string[]
  readonly stageHistory: readonly PrWorkflowStage[]
}

export interface PrWorkflowConfig {
  readonly repository: string
  readonly headRef: string
  readonly baseRef: string
  readonly headSha: string
  readonly baseSha: string
  readonly requireAjnaApproval: boolean
}

export function createPrWorkflowState(config: PrWorkflowConfig): PrWorkflowState {
  return {
    stage: 'INVESTIGATE',
    repository: config.repository,
    headRef: config.headRef,
    baseRef: config.baseRef,
    headSha: config.headSha,
    baseSha: config.baseSha,
    changedFiles: [],
    ajnaGateResult: undefined,
    blockReasons: [],
    stageHistory: ['INVESTIGATE'],
  }
}

export function advancePrWorkflow(
  state: PrWorkflowState,
  changedFiles: readonly CodemindChangedFileContext[],
): PrWorkflowState {
  const reviewInput: AjnaLiveReviewInput = {
    repository: state.repository,
    headRef: state.headRef,
    baseRef: state.baseRef,
    headSha: state.headSha,
    baseSha: state.baseSha,
    changedFiles,
  }

  const ajnaGateResult = evaluateAjnaMergeGate(reviewInput)
  const blockReasons: string[] = []

  if (ajnaGateResult.verdict === 'BLOCKED') {
    for (const reason of ajnaGateResult.reasons) {
      blockReasons.push(reason)
    }
  }

  const nextStage: PrWorkflowStage =
    ajnaGateResult.verdict === 'BLOCKED'
      ? 'BLOCKED'
      : ajnaGateResult.verdict === 'NEEDS_OPERATOR_REVIEW'
        ? 'REVIEW'
        : 'PREPARE_PR'

  return {
    ...state,
    stage: nextStage,
    changedFiles,
    ajnaGateResult,
    blockReasons,
    stageHistory: [...state.stageHistory, nextStage],
  }
}

export function completePrWorkflow(state: PrWorkflowState): PrWorkflowState {
  return {
    ...state,
    stage: 'COMPLETED',
    stageHistory: [...state.stageHistory, 'COMPLETED'],
  }
}

export function renderPrWorkflowState(state: PrWorkflowState): string {
  const lines = [
    'CodeMind PR Workflow',
    '',
    `Stage: ${state.stage}`,
    `Repository: ${state.repository}`,
    `Branch: ${state.headRef} → ${state.baseRef}`,
    `Changed files: ${state.changedFiles.length}`,
  ]

  if (state.ajnaGateResult !== undefined) {
    lines.push('')
    lines.push(`Ajna verdict: ${state.ajnaGateResult.verdict}`)
    lines.push(`Risk level: ${state.ajnaGateResult.riskLevel}`)
    lines.push(`Merge decision: ${state.ajnaGateResult.mergeDecision}`)
  }

  if (state.blockReasons.length > 0) {
    lines.push('')
    lines.push('Block reasons:')
    for (const reason of state.blockReasons) {
      lines.push(`  - ${reason}`)
    }
  }

  lines.push('')
  lines.push(`Stage history: ${state.stageHistory.join(' → ')}`)

  return lines.join('\n')
}
