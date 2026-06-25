import { describe, expect, it } from 'vitest'

import {
  getCompletedRuntimeBuildPhaseCount,
  getNextRuntimeBuildPhase,
  renderRuntimeBuildState,
  RUNTIME_BUILD_PHASES,
} from './runtime-build-state.js'

describe('runtime build state', () => {
  it('records Phases A through G as complete', () => {
    expect(getCompletedRuntimeBuildPhaseCount()).toBe(7)
    expect(RUNTIME_BUILD_PHASES.slice(0, 7).every((phase) => phase.state === 'COMPLETE')).toBe(true)
  })

  it('points to Phase H as next', () => {
    expect(getNextRuntimeBuildPhase()).toMatchObject({ id: 'H', state: 'NEXT' })
  })

  it('records Phase F active command', () => {
    const phaseF = RUNTIME_BUILD_PHASES.find((phase) => phase.id === 'F')
    expect(phaseF).toBeDefined()
    expect(phaseF?.activeCommands).toContain('codemind live-read-policy <json-file>')
  })

  it('records Phase G active command', () => {
    const phaseG = RUNTIME_BUILD_PHASES.find((phase) => phase.id === 'G')
    expect(phaseG).toBeDefined()
    expect(phaseG?.activeCommands).toContain('codemind live-read-client-fixture <json-file>')
  })

  it('renders active command and boundary details', () => {
    const output = renderRuntimeBuildState()

    expect(output).toContain('CodeMind runtime build state')
    expect(output).toContain('Completed phases: 7')
    expect(output).toContain('Phase A')
    expect(output).toContain('codemind runtime run <goal> --approval-ticket <id>')
    expect(output).toContain('codemind ci-review --fixture-file <json-file>')
    expect(output).toContain('codemind live-read-policy <json-file>')
    expect(output).toContain('codemind live-read-client-fixture <json-file>')
    expect(output).toContain('Next phase: Phase H')
  })
})
