import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { MissionService } from '../mission/mission-service.js'
import { MissionStore } from '../mission/mission-store.js'
import type { SymbolWrightMission } from '../mission/mission-types.js'
import { createAutonomousMissionRuntime } from './autonomous-mission-runtime.js'
import type { MissionTaskExecutor } from './persistent-mission-executor.js'
import { RepositorySemanticIndexStore } from './repository-semantic-index-store.js'

const roots: string[] = []
const MISSION_ID = 'mission_33333333-3333-4333-8333-333333333333'
const MARKER = '// SymbolWright post-Bundle #6 repository trial marker'

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('post-Bundle #6 SymbolWright repository trial', () => {
  it('indexes real SymbolWright source, mutates a safe copy, validates it, and generates release evidence', async () => {
    const sourceRoot = process.cwd()
    const workspaceRoot = await temporaryRoot('symbolwright-repository-trial-workspace-')
    const repositoryRoot = await temporaryRoot('symbolwright-repository-trial-copy-')
    const releasePath = 'src/autonomy/autonomous-mission-release.ts'
    await copyText(sourceRoot, repositoryRoot, 'package.json')
    await copyText(sourceRoot, repositoryRoot, releasePath)

    const missionStore = new MissionStore({ workspaceRoot })
    const storedMission = mission(repositoryRoot)
    missionStore.createMission(storedMission)
    const missionService = new MissionService({ workspaceRoot, store: missionStore })
    const semanticStore = new RepositorySemanticIndexStore(
      path.join(workspaceRoot, '.symbolwright'),
    )
    await expect(semanticStore.load(repositoryRoot)).resolves.toBeUndefined()

    const taskExecutor: MissionTaskExecutor = {
      async execute(task) {
        if (task.kind === 'edit-session') {
          const absolutePath = path.join(repositoryRoot, releasePath)
          const content = await readFile(absolutePath, 'utf8')
          await writeFile(absolutePath, `${content.trimEnd()}\n\n${MARKER}\n`)
          return {
            state: 'completed',
            modifiedFiles: [releasePath],
            evidence: [{ kind: 'edit-session', id: 'trial-edit-release-service' }],
          }
        }
        if (task.kind === 'validation') {
          const validation = await validateTrialTask(task.objective, repositoryRoot, releasePath)
          return {
            state: validation.passed ? 'completed' : 'failed',
            evidence: [{ kind: 'validation', id: validation.id }],
            diagnostics: validation.passed ? [] : [validation.diagnostic],
            artifacts: [validation.summary],
          }
        }
        return {
          state: 'completed',
          evidence: [{ kind: 'tool-call', id: `trial-analysis-${task.id}` }],
          artifacts: task.resources.reads,
        }
      },
    }
    const runtime = createAutonomousMissionRuntime({
      workspaceRoot,
      missionService,
      taskExecutor,
      validationCommands: ['trial:source-marker', 'trial:package-json'],
      now: () => new Date('2026-07-23T23:30:00.000Z'),
    })

    const release = await runtime.release.execute(storedMission.id)
    const index = await semanticStore.load(repositoryRoot)

    expect(index).toBeDefined()
    expect(index?.files.map((file) => file.path)).toEqual([
      'package.json',
      'src/autonomy/autonomous-mission-release.ts',
    ])
    expect(index?.symbols.map((symbol) => symbol.name)).toContain('AutonomousMissionReleaseService')
    expect(await readFile(path.join(repositoryRoot, releasePath), 'utf8')).toContain(MARKER)
    expect(release.executionMode).toBe('start')
    expect(release.dashboard.status).toBe('completed')
    expect(release.acceptance.status).toBe('accepted')
    expect(release.acceptance.validation.passed).toBe(true)
    expect(release.acceptance.modifiedFiles).toEqual([releasePath])
    expect(release.acceptance.intelligence?.mergeReadiness.decision).toBe('ready')
    expect(release.state).toBe('merge-ready')
    expect(release.nextAction).toBe('merge')
    expect(release.acceptance.pullRequest.title).toMatch(/^feat\(agent\):/)
    expect(missionService.readEvents(storedMission.id).map((event) => event.type)).toContain(
      'autonomy.release.generated',
    )
  })
})

async function validateTrialTask(
  objective: string,
  repositoryRoot: string,
  releasePath: string,
): Promise<{ passed: boolean; id: string; diagnostic: string; summary: string }> {
  if (objective === 'Run trial:source-marker') {
    const content = await readFile(path.join(repositoryRoot, releasePath), 'utf8')
    const passed = content.includes(MARKER)
    return {
      passed,
      id: 'trial-validation-source-marker',
      diagnostic: 'The repository trial edit marker was not found.',
      summary: 'Validated the real copied SymbolWright release-service source mutation.',
    }
  }
  if (objective === 'Run trial:package-json') {
    const parsed = JSON.parse(
      await readFile(path.join(repositoryRoot, 'package.json'), 'utf8'),
    ) as {
      name?: unknown
    }
    const passed = parsed.name === 'symbolwright'
    return {
      passed,
      id: 'trial-validation-package-json',
      diagnostic: 'The copied repository package identity is not symbolwright.',
      summary: 'Validated the copied SymbolWright package manifest.',
    }
  }
  return {
    passed: false,
    id: 'trial-validation-unknown',
    diagnostic: `Unexpected repository trial validation objective: ${objective}`,
    summary: 'Rejected an unknown trial validation phase.',
  }
}

function mission(repositoryRoot: string): SymbolWrightMission {
  const now = '2026-07-23T23:20:00.000Z'
  return {
    schemaVersion: 1,
    revision: 1,
    id: MISSION_ID,
    name: 'SymbolWright repository forensic mission trial',
    objective: 'Harden AutonomousMissionReleaseService behavior',
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
    labels: ['forensic-trial'],
  }
}

async function copyText(
  sourceRoot: string,
  targetRoot: string,
  relativePath: string,
): Promise<void> {
  const destination = path.join(targetRoot, relativePath)
  await mkdir(path.dirname(destination), { recursive: true })
  await writeFile(destination, await readFile(path.join(sourceRoot, relativePath), 'utf8'))
}

async function temporaryRoot(prefix: string): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), prefix))
  roots.push(root)
  return root
}
