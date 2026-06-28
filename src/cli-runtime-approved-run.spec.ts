import { describe, expect, it } from 'vitest'

import { renderApprovedRuntimeRun } from './cli-runtime-approved-run.js'

describe('renderApprovedRuntimeRun', () => {
  it('renders an approved runtime run with goal and ticket', async () => {
    const output = await renderApprovedRuntimeRun(
      ['fix lint', '--approval-ticket', 'TICKET-001'],
      '/repo',
    )

    expect(output).toContain('CodeMind approved runtime run')
    expect(output).toContain('Goal: fix lint')
    expect(output).toContain('Ticket: TICKET-001')
  })

  it('includes audit trail', async () => {
    const output = await renderApprovedRuntimeRun(
      ['refactor', '--approval-ticket', 'TICKET-002'],
      '/repo',
    )

    expect(output).toContain('Ticket: TICKET-002')
    expect(output).toContain('Approved by: operator')
  })

  it('includes boundary assertions', async () => {
    const output = await renderApprovedRuntimeRun(
      ['test', '--approval-ticket', 'TICKET-003'],
      '/repo',
    )

    expect(output).toContain('Boundary:')
    expect(output).toContain('approval-gated dry-run representation only')
    expect(output).toContain('no file is modified')
    expect(output).toContain('no shell command is executed')
    expect(output).toContain('no GitHub write is performed')
  })

  it('throws when approval ticket is missing', async () => {
    await expect(renderApprovedRuntimeRun(['fix lint'], '/repo')).rejects.toThrow(
      'Missing required flag',
    )
  })

  it('throws when goal is missing', async () => {
    await expect(
      renderApprovedRuntimeRun(['--approval-ticket', 'TICKET-001'], '/repo'),
    ).rejects.toThrow('Missing goal')
  })

  it('handles multi-word goals', async () => {
    const output = await renderApprovedRuntimeRun(
      ['add', 'new', 'feature', '--approval-ticket', 'T-1'],
      '/repo',
    )

    expect(output).toContain('Goal: add new feature')
  })
})
