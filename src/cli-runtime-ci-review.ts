import {
  createProposalRuntimeContext,
  createProposalRuntimeRegistry,
} from './runtime/runtime-proposal-registry.js'

export async function renderRuntimeCiReview(
  focus: string | undefined,
  cwd: string = process.cwd(),
): Promise<string> {
  const registry = createProposalRuntimeRegistry()
  const tool = registry.getOrThrow('ci_review')

  return tool.execute({ source: focus }, createProposalRuntimeContext(cwd))
}
