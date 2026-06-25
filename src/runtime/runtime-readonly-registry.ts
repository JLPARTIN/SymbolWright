import { buildGoalPlan, planGoalTool } from './planner/goal-planner.js'
import { createDefaultRuntimePolicy } from './policy/runtime-policy.js'
import { createRuntimeRegistry } from './registry/runtime-registry.js'
import { listFilesTool } from './tools/list-files-tool.js'
import { readFileTool } from './tools/read-file-tool.js'
import { searchFilesTool } from './tools/search-files-tool.js'
import { validationPlanTool } from './tools/validation-plan-tool.js'
import type { RuntimeToolContext } from './types.js'

export function createReadOnlyRuntimeContext(cwd: string = process.cwd()): RuntimeToolContext {
  return {
    cwd,
    policy: createDefaultRuntimePolicy(),
  }
}

export function createReadOnlyRuntimeRegistry() {
  return createRuntimeRegistry([
    planGoalTool,
    listFilesTool,
    readFileTool,
    searchFilesTool,
    validationPlanTool,
  ])
}

export { buildGoalPlan }
