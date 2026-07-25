import { describe, expect, it } from 'vitest'

import {
  parseWorkspaceArgs,
  renderWorkspaceCommand,
  buildWorkspaceState,
  renderWorkspaceState,
  renderWorkspaceJson,
  renderWorkspaceServePlan,
} from './cli-workspace.js'

describe('parseWorkspaceArgs', () => {
  it('parses a mission and json flag', () => {
    expect(parseWorkspaceArgs(['modernize', 'ProofLine', '--json'])).toEqual({
      mission: 'modernize ProofLine',
      json: true,
    })
  })

  it('parses serve host and port flags', () => {
    expect(parseWorkspaceArgs(['--serve', '--host', '0.0.0.0', '--port', '3005'])).toEqual({
      json: false,
      serve: true,
      host: '0.0.0.0',
      port: 3005,
    })
  })

  it('omits blank missions', () => {
    expect(parseWorkspaceArgs([])).toEqual({ json: false })
  })

  it('rejects invalid ports', () => {
    expect(() => parseWorkspaceArgs(['--serve', '--port', '99999'])).toThrow(
      'Invalid workspace port',
    )
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

    expect(output).toContain('SymbolWright Workspace')
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

    expect(parsed.command).toBe('symbolwright-workspace')
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

describe('renderWorkspaceServePlan', () => {
  it('renders the real local web API endpoints and boundary', () => {
    const output = renderWorkspaceServePlan({ json: false, serve: true, port: 3005 })

    expect(output).toContain('SymbolWright Workspace Web Surface')
    expect(output).toContain('http://127.0.0.1:3005')
    expect(output).toContain('GET /api/health')
    expect(output).toContain('GET /api/providers')
    expect(output).toContain('GET /api/aelib')
    expect(output).toContain('no browser shell execution')
    expect(output).toContain('no fake external connection state')
  })
})

describe('renderWorkspaceCommand', () => {
  it('renders real workspace state for text output', () => {
    const output = renderWorkspaceCommand([])

    expect(output).toContain('SymbolWright Workspace')
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

    expect(parsed.command).toBe('symbolwright-workspace')
    expect(parsed.cwd).toBeTruthy()
    expect(parsed.repoCount).toBe(1)
  })

  it('renders serve plan without starting the server in pure render mode', () => {
    const output = renderWorkspaceCommand(['--serve', '--port', '3005'])

    expect(output).toContain('SymbolWright Workspace Web Surface')
    expect(output).toContain('GET /api/providers')
    expect(output).toContain('GET /api/aelib')
  })
})
