import {
  createFixtureContext,
  createFixtureRegistry,
} from './runtime/registry/fixture-registry-factory.js'

export async function renderRuntimePrNotesGithubFixture(
  fixturePath: string,
  cwd: string = process.cwd(),
): Promise<string> {
  const registry = createFixtureRegistry('github_read')
  const tool = registry.getOrThrow('github_pr_fixture_review')

  return tool.execute({ path: fixturePath }, createFixtureContext(cwd))
}

export async function renderRuntimeCiReviewGithubFixture(
  fixturePath: string,
  cwd: string = process.cwd(),
): Promise<string> {
  const registry = createFixtureRegistry('github_read')
  const tool = registry.getOrThrow('github_ci_fixture_review')

  return tool.execute({ path: fixturePath }, createFixtureContext(cwd))
}
