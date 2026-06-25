import { createReadOnlyRuntimeContext, createReadOnlyRuntimeRegistry } from './runtime/runtime-readonly-registry.js'

export async function renderRuntimeValidationPlan(
  focus: string | undefined,
  cwd: string = process.cwd(),
): Promise<string> {
  const registry = createReadOnlyRuntimeRegistry()
  const tool = registry.getOrThrow('validation_plan')

  return tool.execute({ focus }, createReadOnlyRuntimeContext(cwd))
}
