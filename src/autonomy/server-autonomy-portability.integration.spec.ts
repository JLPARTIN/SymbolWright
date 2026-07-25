import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { MissionService } from '../mission/mission-service.js'
import { MissionStore } from '../mission/mission-store.js'
import type { SymbolWrightMission } from '../mission/mission-types.js'
import type { PortableValidationRunner } from '../portability/portable-validation-runner.js'
import type { SandboxRunner } from '../runtime/sandbox/sandbox-runner.js'
import { createServerAutonomyRuntime } from './server-autonomy-runtime.js'

const roots: string[] = []
const MISSION_ID = 'mission_00000000-0000-4000-8000-000000000007'

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('server autonomy repository portability', () => {
  it('discovers, plans, and executes validation across mixed package roots', async () => {
    const workspaceRoot = await temporaryRoot('symbolwright-portability-workspace-')
    const repositoryRoot = await temporaryRoot('symbolwright-portability-repository-')
    await write(
      repositoryRoot,
      'package.json',
      JSON.stringify({ name: 'root', scripts: { lint: 'eslint .', build: 'tsc' } }),
    )
    await write(repositoryRoot, 'src/index.ts', 'export const root = true\n')
    await write(repositoryRoot, 'src/other.ts', 'export const other = true\n')
    await write(
      repositoryRoot,
      'apps/web/package.json',
      JSON.stringify({ name: 'web', scripts: { test: 'vitest run' } }),
    )
    await write(repositoryRoot, 'apps/web/src/app.ts', 'export const app = true\n')
    await write(repositoryRoot, 'apps/web/src/view.ts', 'export const view = true\n')
    await write(repositoryRoot, 'services/api/pyproject.toml', '[project]\nname = "api"\n')
    await write(repositoryRoot, 'services/api/api.py', 'def value():\n    return 1\n')

    const store = new MissionStore({ workspaceRoot })
    const mission = createMission(repositoryRoot)
    store.createMission(mission)
    const missionService = new MissionService({ workspaceRoot, store })
    const portableRun = vi.fn<PortableValidationRunner['run']>(async (request) => ({
      outcome: 'PASS',
      command: request.command,
      image: request.command.startsWith('python') ? 'python:3.12-bookworm' : 'node:22-bookworm',
      exitCode: 0,
      stdout: 'passed',
      stderr: '',
      durationMs: 5,
    }))
    const sandboxRun = vi.fn<SandboxRunner['runCommand']>(async (request) => ({
      outcome: 'EXECUTED',
      runner: 'docker',
      command: [request.binary, ...request.args].join(' '),
      stdout: 'passed',
      stderr: '',
      exitCode: 0,
      reason: null,
    }))
    const runtime = createServerAutonomyRuntime({
      workspaceRoot,
      missionService,
      hasGitHubToken: false,
      enablePortabilityWebResearch: false,
      portableRunner: { run: portableRun },
      sandboxRunner: { runCommand: sandboxRun },
      editExecutor: {
        async execute() {
          return {
            state: 'completed',
            modifiedFiles: ['services/api/api.py'],
            evidence: [{ kind: 'edit-session', id: 'portable-edit' }],
          }
        },
      },
    })

    const result = await runtime.coordinator.start(mission.id)
    const validationObjectives = result.plan.graph.tasks
      .filter((task) => task.kind === 'validation')
      .map((task) => task.objective)

    expect(validationObjectives).toEqual(
      expect.arrayContaining([
        'Run npm run lint',
        'Run npm run build',
        'Run symbolwright-cwd:apps/web::npm run test',
        'Run symbolwright-cwd:services/api::python -m pytest',
        'Run symbolwright-cwd:services/api::python -m compileall .',
      ]),
    )
    expect(result.execution.completedAt).toBeDefined()
    expect(result.execution.graph.tasks.every((task) => task.state === 'completed')).toBe(true)
    expect(portableRun).toHaveBeenCalledWith(
      expect.objectContaining({
        repositoryRoot: path.join(repositoryRoot, 'apps/web'),
        command: 'npm run test',
      }),
    )
    expect(portableRun).toHaveBeenCalledWith(
      expect.objectContaining({
        repositoryRoot: path.join(repositoryRoot, 'services/api'),
        command: 'python -m pytest',
      }),
    )
    expect(sandboxRun).toHaveBeenCalled()
    expect(missionService.readEvents(mission.id).map((event) => event.type)).toContain(
      'autonomy.portability.detected',
    )
  })
})

function createMission(repositoryRoot: string): SymbolWrightMission {
  const now = '2026-07-24T01:10:00.000Z'
  return {
    schemaVersion: 1,
    revision: 1,
    id: MISSION_ID,
    name: 'Mixed repository portability mission',
    objective: 'Update services/api/api.py while preserving the mixed repository',
    status: 'ACTIVE',
    createdAt: now,
    updatedAt: now,
    lastOpenedAt: now,
    repository: { rootPath: repositoryRoot, modifiedPaths: [] },
    agent: { runtimeMode: 'APPROVED_EXECUTION', messages: [] },
    workspace: { kind: 'repository', openFiles: [], scratchAttached: false },
    evidence: {
      toolCalls: [],
      validationRuns: [],
      webAccesses: [],
      mcpCalls: [],
      subagentRuns: [],
      skillRuns: [],
    },
    references: {
      checkpointIds: [],
      checkpointLinks: [],
      memoryEntryIds: [],
      memoryLinks: [],
      commitShas: [],
      pullRequestUrls: [],
    },
    labels: ['portability'],
  }
}

async function temporaryRoot(prefix: string): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), prefix))
  roots.push(root)
  return root
}

async function write(root: string, relativePath: string, content: string): Promise<void> {
  const destination = path.join(root, relativePath)
  await mkdir(path.dirname(destination), { recursive: true })
  await writeFile(destination, content)
}
