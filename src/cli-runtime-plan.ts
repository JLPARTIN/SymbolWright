import { createReadOnlyRuntimeContext, createReadOnlyRuntimeRegistry } from './runtime/runtime-readonly-registry.js'

export async function renderRuntimePlan(goal: string, cwd: string = process.cwd()): Promise<string> {
  const registry = createReadOnlyRuntimeRegistry()
  const tool = registry.getOrThrow('plan_goal')

  return tool.execute({ goal }, createReadOnlyRuntimeContext(cwd))
}
