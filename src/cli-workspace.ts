import { createInitialTuiState } from './tui/tui.types.js'
import { renderTuiWorkspace } from './tui/tui-renderer.js'

export interface WorkspaceCommandOptions {
  readonly mission?: string
  readonly json: boolean
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

export function renderWorkspaceCommand(args: readonly string[]): string {
  const options = parseWorkspaceArgs(args)
  const state = createInitialTuiState('workspace-preview', 'codemind-local-preview', 'interactive')
  const commandHistory = [
    'codemind status',
    'codemind project-context .',
    ...(options.mission !== undefined ? [`codemind workspace ${options.mission}`] : []),
  ]

  if (options.json) {
    return JSON.stringify(
      {
        command: 'codemind workspace',
        mode: state.mode,
        mission: options.mission ?? null,
        panels: ['mission', 'history', 'stream', 'tools', 'swarm', 'ajna', 'approval'],
        safety: {
          mutatesFiles: false,
          invokesProvider: false,
          requiresApproval: false,
        },
      },
      null,
      2,
    )
  }

  return renderTuiWorkspace(state, {
    ...(options.mission !== undefined ? { mission: options.mission } : {}),
    commandHistory,
  })
}
