import {
  createProposalRuntimeContext,
  createProposalRuntimeRegistry,
} from './runtime/runtime-proposal-registry.js'

export async function renderRuntimeProposePatch(
  goal: string,
  cwd: string = process.cwd(),
): Promise<string> {
  const registry = createProposalRuntimeRegistry()
  const tool = registry.getOrThrow('propose_edit')

  return tool.execute({ goal }, createProposalRuntimeContext(cwd))
}
