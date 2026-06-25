import { renderRuntimeCiReviewGithubFixture, renderRuntimePrNotesGithubFixture } from './cli-runtime-github-fixture.js'

export async function renderFixtureCommand(command: string, fixturePath: string): Promise<string> {
  if (fixturePath.trim().length === 0) {
    throw new Error(`Missing fixture path for ${command}.`)
  }

  if (command === 'pr-notes') {
    return renderRuntimePrNotesGithubFixture(fixturePath)
  }

  if (command === 'ci-review') {
    return renderRuntimeCiReviewGithubFixture(fixturePath)
  }

  throw new Error(`Unsupported fixture command: ${command}`)
}

export function findFixtureArg(args: readonly string[]): string | undefined {
  const index = args.indexOf('--fixture-file')
  if (index === -1) {
    return undefined
  }

  return args[index + 1]
}
