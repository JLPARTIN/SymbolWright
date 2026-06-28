import fs from 'node:fs'

import type { WriteIntentTarget } from './runtime/write/write-intent.js'
import {
  createFixtureContext,
  createFixtureRegistry,
} from './runtime/registry/fixture-registry-factory.js'

export interface WriteIntentFixtureRequest {
  readonly id: string
  readonly target: WriteIntentTarget
  readonly targetPath: string
  readonly reason: string
  readonly expectedDiffSummary: string
  readonly validationPlan: readonly string[]
  readonly rollbackNote: string
}

export async function renderRuntimeWriteIntent(
  fixturePath: string,
  cwd: string = process.cwd(),
): Promise<string> {
  const raw = JSON.parse(fs.readFileSync(fixturePath, 'utf8')) as WriteIntentFixtureRequest

  if (typeof raw.id !== 'string' || raw.id.trim().length === 0) {
    throw new Error('Fixture must include a non-empty "id" field.')
  }

  if (typeof raw.target !== 'string') {
    throw new Error('Fixture must include a "target" field.')
  }

  const registry = createFixtureRegistry('write_prep')
  const context = createFixtureContext(cwd)

  const tool = registry.getOrThrow('write_intent_plan')
  return tool.execute(
    {
      id: raw.id,
      target: raw.target,
      targetPath: raw.targetPath ?? '',
      reason: raw.reason ?? '',
      expectedDiffSummary: raw.expectedDiffSummary ?? '',
      validationPlan: raw.validationPlan ?? [],
      rollbackNote: raw.rollbackNote ?? '',
    },
    context,
  )
}
