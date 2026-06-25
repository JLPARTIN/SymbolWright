import { createReadOnlyRuntimeContext, createReadOnlyRuntimeRegistry } from './runtime/runtime-readonly-registry.js'

export async function renderRuntimeSearch(query: string, cwd: string = process.cwd()): Promise<string> {
  const registry = createReadOnlyRuntimeRegistry()
  const tool = registry.getOrThrow('search_files')

  return tool.execute({ query }, createReadOnlyRuntimeContext(cwd))
}
