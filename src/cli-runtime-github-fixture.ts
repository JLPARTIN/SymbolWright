import {
  createGitHubReadRuntimeContext,
  createGitHubReadRuntimeRegistry,
} from './runtime/runtime-github-read-registry.js'

export async function renderRuntimePrNotesGithubFixture(
  fixturePath: string,
  cwd: string = process.cwd(),
): Promise<string> {
  const registry = createGitHubReadRuntimeRegistry()
  const tool = registry.getOrThrow('github_pr_fixture_review')

  return tool.execute({ path: fixturePath }, createGitHubReadRuntimeContext(cwd))
}

export async function renderRuntimeCiReviewGithubFixture(
  fixturePath: string,
  cwd: string = process.cwd(),
): Promise<string> {
  const registry = createGitHubReadRuntimeRegistry()
  const tool = registry.getOrThrow('github_ci_fixture_review')

  return tool.execute({ path: fixturePath }, createGitHubReadRuntimeContext(cwd))
}
