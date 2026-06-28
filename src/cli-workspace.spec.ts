import { describe, expect, it } from 'vitest'

import {
  parseWorkspaceArgs,
  renderWorkspaceCommand,
  buildWorkspaceState,
  renderWorkspaceState,
  renderWorkspaceJson,
} from './cli-workspace.js'

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

describe('buildWorkspaceState', () => {
  it('builds state from cwd with real workspace manager', () => {
    const state = buildWorkspaceState(process.cwd())

    expect(state.cwd).toBe(process.cwd())
    expect(state.primaryName).toBeTruthy()
    expect(state.primaryPath).toBe(process.cwd())
    expect(state.repoCount).toBe(1)
    expect(state.repos).toHaveLength(1)
    expect(state.repos[0]?.rootPath).toBe(process.cwd())
  })
})

describe('renderWorkspaceState', () => {
  it('renders workspace with primary repo and boundary', () => {
    const state = buildWorkspaceState(process.cwd())
    const output = renderWorkspaceState(state)

    expect(output).toContain('CodeMind Workspace')
    expect(output).toContain('Primary:')
    expect(output).toContain(process.cwd())
    expect(output).toContain('Repos: 1')
    expect(output).toContain('Boundary:')
    expect(output).toContain('read-only workspace listing')
    expect(output).toContain('no file writes or mutations')
  })

  it('does not contain preview or inactive placeholder strings', () => {
    const state = buildWorkspaceState(process.cwd())
    const output = renderWorkspaceState(state)

    expect(output).not.toContain('preview')
    expect(output).not.toContain('No active tools')
    expect(output).not.toContain('No swarm agents active')
    expect(output).not.toContain('Ajna: Inactive')
  })
})

describe('renderWorkspaceJson', () => {
  it('renders json with real workspace data', () => {
    const state = buildWorkspaceState(process.cwd())
    const output = renderWorkspaceJson(state, 'ship workspace')
    const parsed = JSON.parse(output) as {
      readonly command: string
      readonly cwd: string
      readonly primary: { readonly displayName: string; readonly rootPath: string }
      readonly repos: readonly { readonly displayName: string; readonly rootPath: string }[]
      readonly repoCount: number
      readonly mission: string
      readonly boundary: { readonly mutatesFiles: boolean; readonly invokesProvider: boolean }
    }

    expect(parsed.command).toBe('codemind-workspace')
    expect(parsed.cwd).toBe(process.cwd())
    expect(parsed.primary.rootPath).toBe(process.cwd())
    expect(parsed.repoCount).toBe(1)
    expect(parsed.repos).toHaveLength(1)
    expect(parsed.mission).toBe('ship workspace')
    expect(parsed.boundary.mutatesFiles).toBe(false)
    expect(parsed.boundary.invokesProvider).toBe(false)
  })

  it('omits mission when not provided', () => {
    const state = buildWorkspaceState(process.cwd())
    const output = renderWorkspaceJson(state)
    const parsed = JSON.parse(output) as Record<string, unknown>

    expect(parsed).not.toHaveProperty('mission')
  })
})

describe('renderWorkspaceCommand', () => {
  it('renders real workspace state for text output', () => {
    const output = renderWorkspaceCommand([])

    expect(output).toContain('CodeMind Workspace')
    expect(output).toContain('Primary:')
    expect(output).toContain('Repos: 1')
    expect(output).toContain('Boundary:')
  })

  it('renders json with real workspace data', () => {
    const output = renderWorkspaceCommand(['--json'])
    const parsed = JSON.parse(output) as {
      readonly command: string
      readonly cwd: string
      readonly repoCount: number
    }

    expect(parsed.command).toBe('codemind-workspace')
    expect(parsed.cwd).toBeTruthy()
    expect(parsed.repoCount).toBe(1)
  })
})
