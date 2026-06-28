import {
  createFixtureContext,
  createFixtureRegistry,
} from './runtime/registry/fixture-registry-factory.js'

export async function renderRuntimeCiReview(
  focus: string | undefined,
  cwd: string = process.cwd(),
): Promise<string> {
  const registry = createFixtureRegistry('proposal')
  const tool = registry.getOrThrow('ci_review')

  return tool.execute({ source: focus }, createFixtureContext(cwd))
}
