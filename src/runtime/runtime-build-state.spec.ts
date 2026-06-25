import { describe, expect, it } from 'vitest'

import {
  getCompletedRuntimeBuildPhaseCount,
  getNextRuntimeBuildPhase,
  renderRuntimeBuildState,
  RUNTIME_BUILD_PHASES,
} from './runtime-build-state.js'

describe('runtime build state', () => {
  it('records Phases A through P as complete', () => {
    expect(getCompletedRuntimeBuildPhaseCount()).toBe(16)
    expect(RUNTIME_BUILD_PHASES.slice(0, 16).every((phase) => phase.state === 'COMPLETE')).toBe(true)
  })

  it('points to Phase Q as next', () => {
    expect(getNextRuntimeBuildPhase()).toMatchObject({ id: 'Q', state: 'NEXT' })
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

  it('records Phase H active command', () => {
    const phaseH = RUNTIME_BUILD_PHASES.find((phase) => phase.id === 'H')
    expect(phaseH).toBeDefined()
    expect(phaseH?.activeCommands).toContain('codemind github-live-read <json-file>')
  })

  it('records Phase I active command', () => {
    const phaseI = RUNTIME_BUILD_PHASES.find((phase) => phase.id === 'I')
    expect(phaseI).toBeDefined()
    expect(phaseI?.activeCommands).toContain('codemind ajna-live-read <json-file>')
  })

  it('records Phase J active command', () => {
    const phaseJ = RUNTIME_BUILD_PHASES.find((phase) => phase.id === 'J')
    expect(phaseJ).toBeDefined()
    expect(phaseJ?.activeCommands).toContain('codemind operator-review <json-file>')
  })

  it('records Phase K active command', () => {
    const phaseK = RUNTIME_BUILD_PHASES.find((phase) => phase.id === 'K')
    expect(phaseK).toBeDefined()
    expect(phaseK?.activeCommands).toContain('codemind write-intent <json-file>')
  })

  it('records Phase L active command', () => {
    const phaseL = RUNTIME_BUILD_PHASES.find((phase) => phase.id === 'L')
    expect(phaseL).toBeDefined()
    expect(phaseL?.activeCommands).toContain('codemind local-write <json-file>')
  })

  it('records Phase M active command', () => {
    const phaseM = RUNTIME_BUILD_PHASES.find((phase) => phase.id === 'M')
    expect(phaseM).toBeDefined()
    expect(phaseM?.activeCommands).toContain('codemind validation-command <json-file>')
  })

  it('records Phase N active command', () => {
    const phaseN = RUNTIME_BUILD_PHASES.find((phase) => phase.id === 'N')
    expect(phaseN).toBeDefined()
    expect(phaseN?.activeCommands).toContain('codemind pr-preparation <json-file>')
  })

  it('records Phase O active command', () => {
    const phaseO = RUNTIME_BUILD_PHASES.find((phase) => phase.id === 'O')
    expect(phaseO).toBeDefined()
    expect(phaseO?.activeCommands).toContain('codemind github-write-proposal <json-file>')
  })

  it('records Phase P active command', () => {
    const phaseP = RUNTIME_BUILD_PHASES.find((phase) => phase.id === 'P')
    expect(phaseP).toBeDefined()
    expect(phaseP?.activeCommands).toContain('codemind github-write-gate <json-file>')
  })

  it('renders active command and boundary details', () => {
    const output = renderRuntimeBuildState()

    expect(output).toContain('CodeMind runtime build state')
    expect(output).toContain('Completed phases: 16')
    expect(output).toContain('Phase A')
    expect(output).toContain('codemind runtime run <goal> --approval-ticket <id>')
    expect(output).toContain('codemind ci-review --fixture-file <json-file>')
    expect(output).toContain('codemind live-read-policy <json-file>')
    expect(output).toContain('codemind live-read-client-fixture <json-file>')
    expect(output).toContain('codemind github-live-read <json-file>')
    expect(output).toContain('codemind ajna-live-read <json-file>')
    expect(output).toContain('codemind operator-review <json-file>')
    expect(output).toContain('codemind write-intent <json-file>')
    expect(output).toContain('codemind local-write <json-file>')
    expect(output).toContain('codemind validation-command <json-file>')
    expect(output).toContain('codemind pr-preparation <json-file>')
    expect(output).toContain('codemind github-write-proposal <json-file>')
    expect(output).toContain('codemind github-write-gate <json-file>')
    expect(output).toContain('Next phase: Phase Q')
  })
})
