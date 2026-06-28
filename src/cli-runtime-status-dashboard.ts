import {
  createWorkflowRuntimeContext,
  createWorkflowRuntimeRegistry,
} from './runtime/runtime-workflow-registry.js'
import {
  buildRuntimeStatusSnapshot,
  renderRuntimeStatusDashboard,
} from './runtime/dashboard/runtime-status-dashboard.js'

export function renderRuntimeStatusDashboardCommand(): string {
  const registry = createWorkflowRuntimeRegistry({})
  const context = createWorkflowRuntimeContext()
  const tools = registry.list()
  const snapshot = buildRuntimeStatusSnapshot(tools, context.policy)

  return renderRuntimeStatusDashboard(snapshot)
}
