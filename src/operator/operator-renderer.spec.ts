import { describe, expect, it } from 'vitest'

import {
  renderMissionAccepted,
  renderOperatorBanner,
  renderOperatorHelp,
  renderOperatorHistory,
  renderOperatorPrompt,
  renderOperatorSession,
} from './operator-renderer.js'
import type { OperatorSessionState } from './operator-types.js'

const session: OperatorSessionState = {
  sessionId: 'operator-test',
  cwd: '/repo',
  startedAt: '2026-06-26T00:00:00.000Z',
  history: [],
}

describe('operator renderer', () => {
  it('renders the workspace banner', () => {
    const output = renderOperatorBanner(session)

    expect(output).toContain('CodeMind Operator Workspace')
    expect(output).toContain('Workspace: /repo')
    expect(output).toContain('READ_ONLY cockpit')
  })

  it('renders the prompt', () => {
    expect(renderOperatorPrompt()).toBe('CodeMind > ')
  })

  it('renders help with mission and slash commands', () => {
    const output = renderOperatorHelp()

    expect(output).toContain('Type plain text to create a read-only mission plan')
    expect(output).toContain('/doctor')
    expect(output).toContain('/run <goal>')
    expect(output).toContain('/exit')
  })

  it('renders mission acceptance with hard safety boundaries', () => {
    const output = renderMissionAccepted('improve docs')

    expect(output).toContain('MISSION ACCEPTED')
    expect(output).toContain('Goal: improve docs')
    expect(output).toContain('no file writes without approval')
  })

  it('renders empty history', () => {
    expect(renderOperatorHistory([])).toContain('No operator history')
  })

  it('renders session metadata', () => {
    const output = renderOperatorSession(session)

    expect(output).toContain('operator-test')
    expect(output).toContain('/repo')
  })
})
