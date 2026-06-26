import fs from 'node:fs'

import {
  executeRepairLoop,
  renderRepairLoopResult,
  type RepairLoopRequest,
} from './runtime/repair/repair-loop.js'

export function renderRepairLoopCommand(fixturePath: string): string {
  const raw = JSON.parse(fs.readFileSync(fixturePath, 'utf8')) as RepairLoopRequest

  if (raw.finding === undefined || typeof raw.finding !== 'object') {
    throw new Error('Fixture must include a "finding" object.')
  }

  if (typeof raw.finding.id !== 'string' || raw.finding.id.trim().length === 0) {
    throw new Error('Fixture finding must include a non-empty "id" field.')
  }

  if (raw.patchProposal === undefined || typeof raw.patchProposal !== 'object') {
    throw new Error('Fixture must include a "patchProposal" object.')
  }

  const request: RepairLoopRequest = {
    finding: raw.finding,
    patchProposal: raw.patchProposal,
    operatorReview: raw.operatorReview ?? undefined,
    validationResults: raw.validationResults ?? [],
    ajnaReassessment: raw.ajnaReassessment ?? undefined,
    stopAtCheckpoint: raw.stopAtCheckpoint ?? undefined,
  }

  const result = executeRepairLoop(request)
  return renderRepairLoopResult(result)
}
