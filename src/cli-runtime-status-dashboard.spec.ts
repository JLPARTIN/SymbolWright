import { describe, expect, it } from 'vitest'

import { renderRuntimeStatusDashboardCommand } from './cli-runtime-status-dashboard.js'

describe('renderRuntimeStatusDashboardCommand', () => {
  it('renders the runtime status dashboard', () => {
    const output = renderRuntimeStatusDashboardCommand()

    expect(output).toContain('SymbolWright runtime status dashboard')
  })

  it('includes completed phase count', () => {
    const output = renderRuntimeStatusDashboardCommand()

    expect(output).toContain('Completed phases:')
  })

  it('includes registered tool count', () => {
    const output = renderRuntimeStatusDashboardCommand()

    expect(output).toContain('Registered tools:')
  })

  it('includes workflow support status', () => {
    const output = renderRuntimeStatusDashboardCommand()

    expect(output).toContain('Workflow support:')
    expect(output).toContain('Ajna workflow:')
  })

  it('includes capabilities list', () => {
    const output = renderRuntimeStatusDashboardCommand()

    expect(output).toContain('Capabilities:')
  })
})
