import {
  createFixtureContext,
  createFixtureRegistry,
} from './runtime/registry/fixture-registry-factory.js'
import {
  buildRuntimeStatusSnapshot,
  renderRuntimeStatusDashboard,
} from './runtime/dashboard/runtime-status-dashboard.js'

export function renderRuntimeStatusDashboardCommand(): string {
  const registry = createFixtureRegistry('workflow')
  const context = createFixtureContext()
  const tools = registry.list()
  const snapshot = buildRuntimeStatusSnapshot(tools, context.policy)

  return renderRuntimeStatusDashboard(snapshot)
}
