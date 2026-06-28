import {
  createReadOnlyRuntimeContext,
  createReadOnlyRuntimeRegistry,
} from './runtime/runtime-readonly-registry.js'

export async function renderRuntimeRead(
  path: string,
  cwd: string = process.cwd(),
): Promise<string> {
  const registry = createReadOnlyRuntimeRegistry()
  const tool = registry.getOrThrow('read_file')

  return tool.execute({ path }, createReadOnlyRuntimeContext(cwd))
}
