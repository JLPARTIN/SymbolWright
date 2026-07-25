import { describe, expect, it } from 'vitest'

import {
  createOperatorSession,
  createDefaultOperatorConsoleHandlers,
  runOperatorInput,
} from './operator-console.js'
import type { OperatorConsoleHandlers } from './operator-types.js'
import { OperatorHistoryStore } from './operator-history-store.js'
import { mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const handlers: OperatorConsoleHandlers = {
  renderStatus: () => 'STATUS',
  renderDoctor: (cwd: string) => `DOCTOR ${cwd}`,
  renderRuntimeStatus: () => 'RUNTIME STATUS',
  renderScan: (dir: string) => `SCAN ${dir}`,
  renderPlan: async (goal: string, cwd: string) => `PLAN ${goal} ${cwd}`,
  renderRun: async (goal: string, cwd: string) => `RUN ${goal} ${cwd}`,
  renderRead: async (path: string, cwd: string) => `READ ${path} ${cwd}`,
  renderSearch: async (query: string, cwd: string) => `SEARCH ${query} ${cwd}`,
  renderValidationPlan: async (focus: string | undefined, cwd: string) =>
    `VALIDATION ${focus ?? 'all'} ${cwd}`,
  renderProposePatch: async (goal: string, cwd: string) => `PROPOSE ${goal} ${cwd}`,
  renderPrNotes: async (focus: string | undefined, cwd: string) =>
    `PR ${focus ?? 'general'} ${cwd}`,
  renderZflowReport: async (fixturePath: string, cwd: string) => `ZFLOW ${fixturePath} ${cwd}`,
  renderWorkspace: (cwd: string) => `WORKSPACE ${cwd}`,
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
    expect(result.output).toContain('SymbolWright Operator Commands')
  })

  it('returns an exit result for /exit', async () => {
    const session = createOperatorSession('/repo')
    const result = await runOperatorInput('/exit', session, handlers)

    expect(result.exit).toBe(true)
    expect(result.output).toContain('Exiting SymbolWright Operator Workspace')
  })
})

describe('runOperatorInput — full command coverage', () => {
  it('/help renders command list', async () => {
    const session = createOperatorSession('/repo')
    const result = await runOperatorInput('/help', session, handlers)

    expect(result.exit).toBe(false)
    expect(result.output).toContain('SymbolWright Operator Commands')
    expect(result.output).toContain('/status')
    expect(result.output).toContain('/plan')
    expect(result.output).toContain('/exit')
  })

  it('/status delegates to renderStatus handler', async () => {
    const session = createOperatorSession('/repo')
    const result = await runOperatorInput('/status', session, handlers)

    expect(result.exit).toBe(false)
    expect(result.output).toBe('STATUS')
  })

  it('/doctor delegates to renderDoctor with session cwd', async () => {
    const session = createOperatorSession('/repo')
    const result = await runOperatorInput('/doctor', session, handlers)

    expect(result.exit).toBe(false)
    expect(result.output).toBe('DOCTOR /repo')
  })

  it('/runtime-status delegates to renderRuntimeStatus', async () => {
    const session = createOperatorSession('/repo')
    const result = await runOperatorInput('/runtime-status', session, handlers)

    expect(result.exit).toBe(false)
    expect(result.output).toBe('RUNTIME STATUS')
  })

  it('/scan without args uses session cwd', async () => {
    const session = createOperatorSession('/repo')
    const result = await runOperatorInput('/scan', session, handlers)

    expect(result.exit).toBe(false)
    expect(result.output).toBe('SCAN /repo')
  })

  it('/scan with dir arg uses that dir', async () => {
    const session = createOperatorSession('/repo')
    const result = await runOperatorInput('/scan src/lib', session, handlers)

    expect(result.output).toBe('SCAN src/lib')
  })

  it('/plan with goal delegates to renderPlan', async () => {
    const session = createOperatorSession('/repo')
    const result = await runOperatorInput('/plan add widget', session, handlers)

    expect(result.output).toBe('PLAN add widget /repo')
  })

  it('/plan without goal returns usage', async () => {
    const session = createOperatorSession('/repo')
    const result = await runOperatorInput('/plan', session, handlers)

    expect(result.output).toBe('Usage: /plan <goal>')
  })

  it('/run with goal delegates to renderRun', async () => {
    const session = createOperatorSession('/repo')
    const result = await runOperatorInput('/run fix lint', session, handlers)

    expect(result.output).toBe('RUN fix lint /repo')
  })

  it('/run without goal returns usage', async () => {
    const session = createOperatorSession('/repo')
    const result = await runOperatorInput('/run', session, handlers)

    expect(result.output).toBe('Usage: /run <goal>')
  })

  it('/search with query delegates to renderSearch', async () => {
    const session = createOperatorSession('/repo')
    const result = await runOperatorInput('/search TODO', session, handlers)

    expect(result.output).toBe('SEARCH TODO /repo')
  })

  it('/search without query returns usage', async () => {
    const session = createOperatorSession('/repo')
    const result = await runOperatorInput('/search', session, handlers)

    expect(result.output).toBe('Usage: /search <query>')
  })

  it('/validation-plan without focus passes undefined', async () => {
    const session = createOperatorSession('/repo')
    const result = await runOperatorInput('/validation-plan', session, handlers)

    expect(result.output).toBe('VALIDATION all /repo')
  })

  it('/validation-plan with focus passes focus string', async () => {
    const session = createOperatorSession('/repo')
    const result = await runOperatorInput('/validation-plan tests', session, handlers)

    expect(result.output).toBe('VALIDATION tests /repo')
  })

  it('/propose with goal delegates to renderProposePatch', async () => {
    const session = createOperatorSession('/repo')
    const result = await runOperatorInput('/propose add tests', session, handlers)

    expect(result.output).toBe('PROPOSE add tests /repo')
  })

  it('/propose without goal returns usage', async () => {
    const session = createOperatorSession('/repo')
    const result = await runOperatorInput('/propose', session, handlers)

    expect(result.output).toBe('Usage: /propose <goal>')
  })

  it('/pr-notes without focus passes undefined', async () => {
    const session = createOperatorSession('/repo')
    const result = await runOperatorInput('/pr-notes', session, handlers)

    expect(result.output).toBe('PR general /repo')
  })

  it('/pr-notes with focus passes focus string', async () => {
    const session = createOperatorSession('/repo')
    const result = await runOperatorInput('/pr-notes security', session, handlers)

    expect(result.output).toBe('PR security /repo')
  })

  it('/zflow with fixture path delegates to renderZflowReport', async () => {
    const session = createOperatorSession('/repo')
    const result = await runOperatorInput('/zflow fixtures/zflow.json', session, handlers)

    expect(result.output).toBe('ZFLOW fixtures/zflow.json /repo')
  })

  it('/zflow without path returns usage', async () => {
    const session = createOperatorSession('/repo')
    const result = await runOperatorInput('/zflow', session, handlers)

    expect(result.output).toBe('Usage: /zflow <fixture-path>')
  })

  it('/workspace delegates to renderWorkspace with session cwd', async () => {
    const session = createOperatorSession('/repo')
    const result = await runOperatorInput('/workspace', session, handlers)

    expect(result.output).toBe('WORKSPACE /repo')
  })

  it('/session renders current session metadata', async () => {
    const session = createOperatorSession('/repo')
    const result = await runOperatorInput('/session', session, handlers)

    expect(result.exit).toBe(false)
    expect(result.output).toContain('Operator Session')
    expect(result.output).toContain(session.sessionId)
    expect(result.output).toContain('/repo')
  })

  it('/history with no prior entries shows only the /history command itself', async () => {
    const session = createOperatorSession('/repo')
    const result = await runOperatorInput('/history', session, handlers)

    expect(result.output).toContain('Operator History')
    expect(result.output).toContain('/history')
  })

  it('/history shows recorded entries', async () => {
    const session = createOperatorSession('/repo')
    const r1 = await runOperatorInput('/status', session, handlers)
    const r2 = await runOperatorInput('/history', r1.session, handlers)

    expect(r2.output).toContain('Operator History')
    expect(r2.output).toContain('/status')
  })

  it('/clear resets session history', async () => {
    const session = createOperatorSession('/repo')
    const r1 = await runOperatorInput('/status', session, handlers)
    expect(r1.session.history).toHaveLength(1)

    const r2 = await runOperatorInput('/clear', r1.session, handlers)

    expect(r2.output).toBe('Operator history cleared.')
    expect(r2.session.history).toEqual([])
  })
})

describe('runOperatorInput — command aliases', () => {
  it('/quit aliases to /exit', async () => {
    const session = createOperatorSession('/repo')
    const result = await runOperatorInput('/quit', session, handlers)

    expect(result.exit).toBe(true)
  })

  it('/runtime aliases to /runtime-status', async () => {
    const session = createOperatorSession('/repo')
    const result = await runOperatorInput('/runtime', session, handlers)

    expect(result.output).toBe('RUNTIME STATUS')
  })

  it('/propose-patch aliases to /propose', async () => {
    const session = createOperatorSession('/repo')
    const result = await runOperatorInput('/propose-patch fix bug', session, handlers)

    expect(result.output).toBe('PROPOSE fix bug /repo')
  })

  it('/validate-plan aliases to /validation-plan', async () => {
    const session = createOperatorSession('/repo')
    const result = await runOperatorInput('/validate-plan lint', session, handlers)

    expect(result.output).toBe('VALIDATION lint /repo')
  })

  it('/? aliases to /help', async () => {
    const session = createOperatorSession('/repo')
    const result = await runOperatorInput('/?', session, handlers)

    expect(result.output).toContain('SymbolWright Operator Commands')
  })

  it('/h aliases to /help', async () => {
    const session = createOperatorSession('/repo')
    const result = await runOperatorInput('/h', session, handlers)

    expect(result.output).toContain('SymbolWright Operator Commands')
  })
})

describe('runOperatorInput — history tracking', () => {
  it('records each command in session history', async () => {
    const session = createOperatorSession('/repo')
    const r1 = await runOperatorInput('/status', session, handlers)
    const r2 = await runOperatorInput('/doctor', r1.session, handlers)
    const r3 = await runOperatorInput('fix bug', r2.session, handlers)

    expect(r3.session.history).toHaveLength(3)
    expect(r3.session.history[0]?.kind).toBe('slash')
    expect(r3.session.history[1]?.kind).toBe('slash')
    expect(r3.session.history[2]?.kind).toBe('mission')
  })

  it('records invalid commands in history', async () => {
    const session = createOperatorSession('/repo')
    const result = await runOperatorInput('/nope', session, handlers)

    expect(result.session.history).toHaveLength(1)
    expect(result.session.history[0]?.kind).toBe('invalid')
  })

  it('does not record empty input in history', async () => {
    const session = createOperatorSession('/repo')
    const result = await runOperatorInput('', session, handlers)

    expect(result.session.history).toEqual([])
  })

  it('persists history to store when provided', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'op-test-'))
    const store = OperatorHistoryStore.fromWorkspace(tempDir)
    const session = createOperatorSession('/repo')

    await runOperatorInput('/status', session, handlers, store)
    await runOperatorInput('/doctor', session, handlers, store)

    const entries = store.list()
    expect(entries).toHaveLength(2)
    expect(entries[0]?.input).toBe('/status')
    expect(entries[1]?.input).toBe('/doctor')
  })

  it('/clear clears the history store', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'op-test-'))
    const store = OperatorHistoryStore.fromWorkspace(tempDir)
    const session = createOperatorSession('/repo')

    const r1 = await runOperatorInput('/status', session, handlers, store)
    expect(store.list()).toHaveLength(1)

    await runOperatorInput('/clear', r1.session, handlers, store)
    expect(store.list()).toHaveLength(0)
  })
})

describe('runOperatorInput — workspace parity', () => {
  it('/workspace renders same workspace model as symbolwright-workspace', async () => {
    const cwd = process.cwd()
    const session = createOperatorSession(cwd)
    const realHandlers = createDefaultOperatorConsoleHandlers()
    const result = await runOperatorInput('/workspace', session, realHandlers)

    expect(result.output).toContain('SymbolWright Workspace')
    expect(result.output).toContain('Primary:')
    expect(result.output).toContain(cwd)
    expect(result.output).toContain('Repos: 1')
    expect(result.output).toContain('Boundary:')
    expect(result.output).not.toContain('preview')
  })
})

describe('createOperatorSession', () => {
  it('creates session with defaults', () => {
    const session = createOperatorSession('/repo')

    expect(session.cwd).toBe('/repo')
    expect(session.sessionId).toMatch(/^operator-\d+$/)
    expect(session.history).toEqual([])
    expect(session.lastMission).toBeUndefined()
  })

  it('accepts pre-existing history', () => {
    const history = [{ timestamp: '2024-01-01', input: '/status', kind: 'slash' as const }]
    const session = createOperatorSession('/repo', history)

    expect(session.history).toEqual(history)
  })
})
