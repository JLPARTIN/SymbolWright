import { describe, expect, it } from 'vitest'

import { createOperatorSession, runOperatorInput } from './operator-console.js'
import type { OperatorConsoleHandlers } from './operator-types.js'

const handlers: OperatorConsoleHandlers = {
  renderStatus: () => 'STATUS',
  renderDoctor: (cwd: string) => `DOCTOR ${cwd}`,
  renderRuntimeStatus: () => 'RUNTIME STATUS',
  renderScan: (dir: string) => `SCAN ${dir}`,
  renderPlan: async (goal: string, cwd: string) => `PLAN ${goal} ${cwd}`,
  renderRun: async (goal: string, cwd: string) => `RUN ${goal} ${cwd}`,
  renderRead: async (path: string, cwd: string) => `READ ${path} ${cwd}`,
  renderSearch: async (query: string, cwd: string) => `SEARCH ${query} ${cwd}`,
  renderValidationPlan: async (focus: string | undefined, cwd: string) => `VALIDATION ${focus ?? 'all'} ${cwd}`,
  renderProposePatch: async (goal: string, cwd: string) => `PROPOSE ${goal} ${cwd}`,
  renderPrNotes: async (focus: string | undefined, cwd: string) => `PR ${focus ?? 'general'} ${cwd}`,
}

describe('runOperatorInput', () => {
  it('returns no output for empty input', async () => {
    const session = createOperatorSession('/repo')
    const result = await runOperatorInput('   ', session, handlers)

    expect(result.exit).toBe(false)
    expect(result.output).toBe('')
    expect(result.session.history).toEqual([])
  })

  it('routes plain text into read-only mission planning', async () => {
    const session = createOperatorSession('/repo')
    const result = await runOperatorInput('improve docs', session, handlers)

    expect(result.exit).toBe(false)
    expect(result.output).toContain('MISSION ACCEPTED')
    expect(result.output).toContain('PLAN improve docs /repo')
    expect(result.session.lastMission).toBe('improve docs')
    expect(result.session.history).toHaveLength(1)
  })

  it('runs slash commands through handlers', async () => {
    const session = createOperatorSession('/repo')
    const result = await runOperatorInput('/read README.md', session, handlers)

    expect(result.output).toBe('READ README.md /repo')
    expect(result.session.history[0]?.kind).toBe('slash')
  })

  it('returns usage for missing slash command arguments', async () => {
    const session = createOperatorSession('/repo')
    const result = await runOperatorInput('/read', session, handlers)

    expect(result.output).toBe('Usage: /read <path>')
  })

  it('renders help for invalid commands', async () => {
    const session = createOperatorSession('/repo')
    const result = await runOperatorInput('/bogus', session, handlers)

    expect(result.output).toContain('Unknown operator command: /bogus')
    expect(result.output).toContain('CodeMind Operator Commands')
  })

  it('returns an exit result for /exit', async () => {
    const session = createOperatorSession('/repo')
    const result = await runOperatorInput('/exit', session, handlers)

    expect(result.exit).toBe(true)
    expect(result.output).toContain('Exiting CodeMind Operator Workspace')
  })
})
