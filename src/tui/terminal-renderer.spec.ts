import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

import { createTerminalRenderer } from './terminal-renderer.js'
import type { AgentLoopEvent } from '../agent/agent-loop.types.js'

describe('terminal-renderer', () => {
  let stdoutSpy: ReturnType<typeof vi.spyOn>
  let stderrSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
  })

  afterEach(() => {
    stdoutSpy.mockRestore()
    stderrSpy.mockRestore()
  })

  it('writes text deltas to stdout', () => {
    const render = createTerminalRenderer()
    const event: AgentLoopEvent = { type: 'text_delta', text: 'hello world' }

    render(event)

    expect(stdoutSpy).toHaveBeenCalledWith('hello world')
  })

  it('writes tool call start to stderr', () => {
    const render = createTerminalRenderer()
    const event: AgentLoopEvent = { type: 'tool_call_start', id: 't1', name: 'read_file' }

    render(event)

    expect(stderrSpy).toHaveBeenCalled()
    const output = stderrSpy.mock.calls.map((c: unknown[]) => String(c[0])).join('')
    expect(output).toContain('read_file')
  })

  it('writes error events to stderr', () => {
    const render = createTerminalRenderer()
    const event: AgentLoopEvent = { type: 'error', error: 'something broke' }

    render(event)

    expect(stderrSpy).toHaveBeenCalled()
    const output = stderrSpy.mock.calls.map((c: unknown[]) => String(c[0])).join('')
    expect(output).toContain('something broke')
  })

  it('writes loop_end summary to stderr', () => {
    const render = createTerminalRenderer()
    const event: AgentLoopEvent = { type: 'loop_end', status: 'completed', totalIterations: 3 }

    render(event)

    const stderrOutput = stderrSpy.mock.calls.map((c: unknown[]) => String(c[0])).join('')
    expect(stderrOutput).toContain('completed')
    expect(stderrOutput).toContain('3')
  })

  it('suppresses tool output in quiet mode', () => {
    const render = createTerminalRenderer({ quiet: true })

    render({ type: 'tool_call_start', id: 't1', name: 'read_file' })
    render({ type: 'iteration_start', iterationNumber: 1 })

    expect(stderrSpy).not.toHaveBeenCalled()
  })

  it('still writes text deltas in quiet mode', () => {
    const render = createTerminalRenderer({ quiet: true })

    render({ type: 'text_delta', text: 'output' })

    expect(stdoutSpy).toHaveBeenCalledWith('output')
  })
})
