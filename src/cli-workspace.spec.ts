import { describe, expect, it } from 'vitest'

import { parseWorkspaceArgs, renderWorkspaceCommand } from './cli-workspace.js'

describe('parseWorkspaceArgs', () => {
  it('parses a mission and json flag', () => {
    expect(parseWorkspaceArgs(['modernize', 'ProofLine', '--json'])).toEqual({
      mission: 'modernize ProofLine',
      json: true,
    })
  })

  it('omits blank missions', () => {
    expect(parseWorkspaceArgs([])).toEqual({ json: false })
  })

  it('rejects unknown flags', () => {
    expect(() => parseWorkspaceArgs(['--write'])).toThrow('Unknown workspace flag')
  })
})

describe('renderWorkspaceCommand', () => {
  it('renders a workspace console preview for a mission', () => {
    const output = renderWorkspaceCommand(['modernize', 'ProofLine'])

    expect(output).toContain('CodeMind Workspace')
    expect(output).toContain('Mission Console:')
    expect(output).toContain('> modernize ProofLine')
    expect(output).toContain('Command History:')
    expect(output).toContain('codemind project-context .')
    expect(output).toContain('Agent Stream:')
    expect(output).toContain('Tools: No active tools.')
    expect(output).toContain('HiveMind: No swarm agents active.')
    expect(output).toContain('Ajna: Inactive')
  })

  it('renders json metadata for workspace integrations', () => {
    const output = renderWorkspaceCommand(['ship', 'workspace', '--json'])
    const parsed = JSON.parse(output) as {
      readonly command: string
      readonly mission: string
      readonly panels: readonly string[]
      readonly safety: { readonly mutatesFiles: boolean; readonly invokesProvider: boolean }
    }

    expect(parsed.command).toBe('codemind workspace')
    expect(parsed.mission).toBe('ship workspace')
    expect(parsed.panels).toContain('mission')
    expect(parsed.panels).toContain('ajna')
    expect(parsed.safety.mutatesFiles).toBe(false)
    expect(parsed.safety.invokesProvider).toBe(false)
  })
})
