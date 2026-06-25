import fs from 'node:fs'

import {
  createPrPreparationRuntimeContext,
  createPrPreparationRuntimeRegistry,
} from './runtime/runtime-pr-preparation-registry.js'

export interface PrPreparationFixtureRequest {
  readonly title: string
  readonly body: string
  readonly baseBranch: string
  readonly headBranch: string
  readonly changedFiles: readonly string[]
  readonly validationChecklist: readonly string[]
  readonly reason: string
}

export async function renderRuntimePrPreparation(
  fixturePath: string,
  cwd: string = process.cwd(),
): Promise<string> {
  const raw = JSON.parse(fs.readFileSync(fixturePath, 'utf8')) as PrPreparationFixtureRequest

  if (typeof raw.title !== 'string' || raw.title.trim().length === 0) {
    throw new Error('Fixture must include a non-empty "title" field.')
  }

  if (typeof raw.body !== 'string' || raw.body.trim().length === 0) {
    throw new Error('Fixture must include a non-empty "body" field.')
  }

  if (typeof raw.reason !== 'string' || raw.reason.trim().length === 0) {
    throw new Error('Fixture must include a non-empty "reason" field.')
  }

  const registry = createPrPreparationRuntimeRegistry({})
  const context = createPrPreparationRuntimeContext(cwd)

  const tool = registry.getOrThrow('pr_preparation')
  return tool.execute(
    {
      title: raw.title,
      body: raw.body,
      baseBranch: raw.baseBranch ?? '',
      headBranch: raw.headBranch ?? '',
      changedFiles: raw.changedFiles ?? [],
      validationChecklist: raw.validationChecklist ?? [],
      reason: raw.reason,
    },
    context,
  )
}
