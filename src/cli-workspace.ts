import { WorkspaceManager } from './workspace/workspace-manager.js'

export interface WorkspaceCommandOptions {
  readonly mission?: string
  readonly json: boolean
}

export interface WorkspaceState {
  readonly cwd: string
  readonly primaryName: string
  readonly primaryPath: string
  readonly repos: readonly { readonly displayName: string; readonly rootPath: string }[]
  readonly repoCount: number
}

export function parseWorkspaceArgs(args: readonly string[]): WorkspaceCommandOptions {
  const missionParts: string[] = []
  let json = false

  for (const arg of args) {
    if (arg === '--json') {
      json = true
      continue
    }

    if (arg.startsWith('--')) {
      throw new Error(`Unknown workspace flag: ${arg}`)
    }

    missionParts.push(arg)
  }

  const mission = missionParts.join(' ').trim()
  return {
    ...(mission.length > 0 ? { mission } : {}),
    json,
  }
}

export function buildWorkspaceState(cwd: string): WorkspaceState {
  const manager = new WorkspaceManager()
  manager.add(cwd)
  const repos = manager.list()
  const primary = manager.getPrimary()

  return {
    cwd,
    primaryName: primary?.displayName ?? 'none',
    primaryPath: primary?.rootPath ?? 'n/a',
    repos: repos.map((r) => ({ displayName: r.displayName, rootPath: r.rootPath })),
    repoCount: repos.length,
  }
}

export function renderWorkspaceState(state: WorkspaceState): string {
  return [
    'CodeMind Workspace',
    '',
    `Primary: ${state.primaryName} (${state.primaryPath})`,
    `Repos: ${state.repoCount}`,
    ...state.repos.map((r) => `  - ${r.displayName} (${r.rootPath})`),
    '',
    'Boundary:',
    '- read-only workspace listing',
    '- no file writes or mutations',
  ].join('\n')
}

export function renderWorkspaceJson(state: WorkspaceState, mission?: string): string {
  return JSON.stringify(
    {
      command: 'codemind-workspace',
      cwd: state.cwd,
      primary: {
        displayName: state.primaryName,
        rootPath: state.primaryPath,
      },
      repos: state.repos,
      repoCount: state.repoCount,
      ...(mission !== undefined ? { mission } : {}),
      boundary: {
        mutatesFiles: false,
        invokesProvider: false,
        requiresApproval: false,
      },
    },
    null,
    2,
  )
}

export function renderWorkspaceCommand(args: readonly string[]): string {
  const options = parseWorkspaceArgs(args)
  const cwd = process.cwd()
  const state = buildWorkspaceState(cwd)

  if (options.json) {
    return renderWorkspaceJson(state, options.mission)
  }

  return renderWorkspaceState(state)
}
