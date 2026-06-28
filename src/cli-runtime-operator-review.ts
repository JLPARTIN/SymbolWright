import fs from 'node:fs'

import type { FakeLiveReadClientData } from './runtime/live-read/fake-live-read-client.js'
import type { OperatorReviewAction } from './runtime/operator/operator-review-packet.js'
import {
  createFixtureContext,
  createFixtureRegistry,
} from './runtime/registry/fixture-registry-factory.js'

export interface OperatorReviewFixtureRequest {
  readonly id: string
  readonly sourceEvidence: readonly string[]
  readonly proposedAction: OperatorReviewAction
  readonly actionDetail: string
  readonly risks: readonly string[]
  readonly validation: readonly string[]
  readonly boundary: readonly string[]
  readonly nextManualStep: string
  readonly clientData?: FakeLiveReadClientData
}

export async function renderRuntimeOperatorReview(
  fixturePath: string,
  cwd: string = process.cwd(),
): Promise<string> {
  const raw = JSON.parse(fs.readFileSync(fixturePath, 'utf8')) as OperatorReviewFixtureRequest

  if (typeof raw.id !== 'string' || raw.id.trim().length === 0) {
    throw new Error('Fixture must include a non-empty "id" field.')
  }

  if (typeof raw.proposedAction !== 'string') {
    throw new Error('Fixture must include a "proposedAction" field.')
  }

  const clientData: FakeLiveReadClientData = raw.clientData ?? {}
  const registry = createFixtureRegistry('operator_review', clientData)
  const context = createFixtureContext(cwd)

  const tool = registry.getOrThrow('operator_review_packet')
  return tool.execute(
    {
      id: raw.id,
      sourceEvidence: raw.sourceEvidence ?? [],
      proposedAction: raw.proposedAction,
      actionDetail: raw.actionDetail ?? '',
      risks: raw.risks ?? [],
      validation: raw.validation ?? [],
      boundary: raw.boundary ?? [],
      nextManualStep: raw.nextManualStep ?? '',
    },
    context,
  )
}
