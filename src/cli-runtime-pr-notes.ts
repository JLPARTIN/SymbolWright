import {
  createProposalRuntimeContext,
  createProposalRuntimeRegistry,
} from './runtime/runtime-proposal-registry.js'

export async function renderRuntimePrNotes(
  focus: string | undefined,
  cwd: string = process.cwd(),
): Promise<string> {
  const registry = createProposalRuntimeRegistry()
  const tool = registry.getOrThrow('pr_notes')

  return tool.execute({ focus }, createProposalRuntimeContext(cwd))
}
