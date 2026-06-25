import { describe, expect, it } from 'vitest'

import {
  getCompletedRuntimeBuildPhaseCount,
  getNextRuntimeBuildPhase,
  renderRuntimeBuildState,
  RUNTIME_BUILD_PHASES,
} from './runtime-build-state.js'

describe('runtime build state', () => {
  it('records Phases A through E as complete', () => {
    expect(getCompletedRuntimeBuildPhaseCount()).toBe(5)
    expect(RUNTIME_BUILD_PHASES.slice(0, 5).every((phase) => phase.state === 'COMPLETE')).toBe(true)
  })

  it('points to Phase F as next', () => {
    expect(getNextRuntimeBuildPhase()).toMatchObject({ id: 'F', state: 'NEXT' })
  })

  it('renders active command and boundary details', () => {
    const output = renderRuntimeBuildState()

    expect(output).toContain('CodeMind runtime build state')
    expect(output).toContain('Completed phases: 5')
    expect(output).toContain('Phase A')
    expect(output).toContain('codemind runtime run <goal> --approval-ticket <id>')
    expect(output).toContain('codemind ci-review --fixture-file <json-file>')
    expect(output).toContain('Next phase: Phase F')
  })
})
