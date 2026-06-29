import { WorkspaceManager } from './workspace/workspace-manager.js'
import {
  buildWorkspaceWebSnapshot,
  startWorkspaceWebServer,
} from './workspace/workspace-web-app.js'

const DEFAULT_WORKSPACE_WEB_HOST = '127.0.0.1'
const DEFAULT_WORKSPACE_WEB_PORT = 3005

export interface WorkspaceCommandOptions {
  readonly mission?: string
  readonly json: boolean
  readonly serve?: true
  readonly host?: string
  readonly port?: number
}

export interface WorkspaceState {
  readonly cwd: string
  readonly primaryName: string
  readonly primaryPath: string
  readonly repos: readonly { readonly displayName: string; readonly rootPath: string }[]
  readonly repoCount: number
}

function parsePort(value: string): number {
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed) || parsed < 1 || parsed > 65535) {
    throw new Error(`Invalid workspace port: ${value}`)
  }
  return parsed
}

export function parseWorkspaceArgs(args: readonly string[]): WorkspaceCommandOptions {
  const missionParts: string[] = []
  let json = false
  let serve = false
  let host: string | undefined
  let port: number | undefined

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === undefined) continue

    if (arg === '--json') {
      json = true
      continue
    }

    if (arg === '--serve') {
      serve = true
      continue
    }

    if (arg === '--host') {
      const value = args[i + 1]
      if (value === undefined || value.startsWith('--')) {
        throw new Error('Missing value for --host')
      }
      host = value
      i++
      continue
    }

    if (arg.startsWith('--host=')) {
      host = arg.slice('--host='.length)
      continue
    }

    if (arg === '--port') {
      const value = args[i + 1]
      if (value === undefined || value.startsWith('--')) {
        throw new Error('Missing value for --port')
      }
      port = parsePort(value)
      i++
      continue
    }

    if (arg.startsWith('--port=')) {
      port = parsePort(arg.slice('--port='.length))
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
    ...(serve ? { serve: true as const } : {}),
    ...(host !== undefined ? { host } : {}),
    ...(port !== undefined ? { port } : {}),
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

export function renderWorkspaceServePlan(options: WorkspaceCommandOptions): string {
  const host = options.host ?? DEFAULT_WORKSPACE_WEB_HOST
  const port = options.port ?? DEFAULT_WORKSPACE_WEB_PORT
  return [
    'CodeMind Workspace Web Surface',
    '',
    `URL: http://${host}:${port}`,
    '',
    'Local runtime API:',
    '- GET /',
    '- GET /api/health',
    '- GET /api/providers',
    '',
    'Boundary:',
    '- no browser shell execution',
    '- no file writes or mutations',
    '- no provider invocation from page load',
    '- no fake external connection state',
  ].join('\n')
}

export function renderWorkspaceCommand(args: readonly string[]): string {
  const options = parseWorkspaceArgs(args)
  const cwd = process.cwd()
  const state = buildWorkspaceState(cwd)

  if (options.serve) {
    return renderWorkspaceServePlan(options)
  }

  if (options.json) {
    return renderWorkspaceJson(state, options.mission)
  }

  return renderWorkspaceState(state)
}

export async function runWorkspaceCommand(args: readonly string[]): Promise<void> {
  const options = parseWorkspaceArgs(args)

  if (options.serve) {
    const cwd = process.cwd()
    const host = options.host ?? DEFAULT_WORKSPACE_WEB_HOST
    const port = options.port ?? DEFAULT_WORKSPACE_WEB_PORT
    const server = await startWorkspaceWebServer({
      host,
      port,
      snapshotFactory: () => buildWorkspaceWebSnapshot(buildWorkspaceState(cwd)),
    })

    console.log(renderWorkspaceServePlan({ ...options, host, port }))
    console.log(`\nListening: ${server.url}`)
    await new Promise<never>(() => undefined)
  }

  console.log(renderWorkspaceCommand(args))
}
