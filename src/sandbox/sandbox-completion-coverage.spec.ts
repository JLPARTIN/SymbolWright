import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { renderSandboxCommand } from '../cli-sandbox.js'
import {
  assertContainerCommandPlanStaysNonExecutable,
  buildSandboxContainerCommandPlan,
} from './sandbox-container-command-plan.js'
import { SandboxHistoryStore } from './sandbox-history.js'
import { DEFAULT_SANDBOX_IMAGE_ALLOWLIST } from './sandbox-images.js'
import type { SandboxContainerEngineStatus } from './sandbox-images.js'
import { buildSandboxInventory, runnerAvailability } from './sandbox-registry.js'
import { SandboxService } from './sandbox-service.js'
import type { SandboxInventory, SandboxRunnerAvailability } from './sandbox-types.js'

const CHECKED_AT = '2026-07-21T00:00:00.000Z'
const EXECUTION_ENV: NodeJS.ProcessEnv = {
  PATH: process.env['PATH'] ?? '',
  CODEMIND_ALLOW_GUARDED_HOST_EXECUTION: 'true',
}

const workspaces: string[] = []
const IMAGE = DEFAULT_SANDBOX_IMAGE_ALLOWLIST[0]!
const AVAILABLE_ENGINE: SandboxContainerEngineStatus = {
  engine: 'podman',
  status: 'available',
  version: '5.0.0',
  reason: 'podman is detectable for future capability evaluation.',
}

function availability(command: string, version = `${command} test`): SandboxRunnerAvailability {
  return runnerAvailability('available', CHECKED_AT, { version })
}

async function tempWorkspace(): Promise<string> {
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'codemind-sandbox-coverage-'))
  workspaces.push(workspace)
  return workspace
}

async function createService(
  commandAvailability: ReadonlyMap<string, SandboxRunnerAvailability>,
  generateExecutionId = () => 'sandbox_coverage_execution',
): Promise<SandboxService> {
  const workspaceRoot = await tempWorkspace()
  return new SandboxService({
    env: EXECUTION_ENV,
    historyStore: new SandboxHistoryStore({ workspaceRoot }),
    generateExecutionId,
    inventory: buildSandboxInventory({
      env: EXECUTION_ENV,
      commandAvailability,
      now: () => new Date(CHECKED_AT),
    }),
    now: () => new Date(CHECKED_AT),
  })
}

afterEach(async () => {
  await Promise.all(
    workspaces.splice(0).map((workspace) => rm(workspace, { recursive: true, force: true })),
  )
})

describe('sandbox completion coverage', () => {
  it('covers CLI usage, traversal, directory, unsupported extension, history, and cleanup branches', async () => {
    const workspaceRoot = await tempWorkspace()
    const directory = path.join(workspaceRoot, 'fixtures')
    await mkdir(directory)
    await writeFile(path.join(workspaceRoot, 'notes.txt'), 'plain text', 'utf8')

    await expect(renderSandboxCommand(['run'])).resolves.toContain('Usage: codemind sandbox run')
    await expect(renderSandboxCommand(['test'])).resolves.toContain('Usage: codemind sandbox test')
    await expect(renderSandboxCommand(['run', '../escape.js'], { workspaceRoot })).resolves.toContain(
      'file must stay inside workspace root',
    )
    await expect(renderSandboxCommand(['run', 'fixtures'], { workspaceRoot })).resolves.toContain(
      'target must be a file',
    )
    await expect(renderSandboxCommand(['run', 'notes.txt'], { workspaceRoot })).resolves.toContain(
      'unsupported file extension',
    )
    await expect(renderSandboxCommand(['history'], { workspaceRoot })).resolves.toContain(
      'no sandbox executions recorded',
    )
    await expect(renderSandboxCommand(['cleanup'], { workspaceRoot })).resolves.toContain(
      'Sandbox Cleanup',
    )
  })

  it('runs a CLI JavaScript file through the shared sandbox service when explicitly approved', async () => {
    const workspaceRoot = await tempWorkspace()
    await writeFile(path.join(workspaceRoot, 'main.js'), "console.log('cli-run-ok')", 'utf8')

    const rendered = await renderSandboxCommand(['run', 'main.js'], {
      workspaceRoot,
      env: EXECUTION_ENV,
      discoverCommandAvailability: async () => new Map([['node', availability('node')]]),
    })

    expect(rendered).toContain('CodeMind Sandbox Execution')
    expect(rendered).toContain('Status: passed')
    expect(rendered).toContain('cli-run-ok')
  })

  it('covers service not-running cancellation and unwired backend result branches', async () => {
    const service = await createService(new Map([['node', availability('node')]]))
    const missing = await service.cancelExecution('missing_execution')
    expect(missing.status).toBe('not_running')
    expect(missing.ok).toBe(false)

    const containerInventory: SandboxInventory = {
      schemaVersion: 1,
      generatedAt: CHECKED_AT,
      images: [],
      warnings: [],
      runners: [
        {
          id: 'container-javascript-test',
          languageIds: ['javascript'],
          displayName: 'Container JavaScript Test Runner',
          trustClass: 'container-isolated',
          backend: 'container',
          availability: { status: 'available', checkedAt: CHECKED_AT, version: 'test' },
          capabilities: {
            run: true,
            compile: false,
            test: false,
            stdin: true,
            multiFile: true,
            repository: true,
            network: false,
          },
          limits: {
            timeoutMs: 1_000,
            compileTimeoutMs: 1_000,
            maxMemoryMb: 128,
            maxProcesses: 4,
            maxOutputBytes: 1024,
            maxArtifactBytes: 1024,
            maxFiles: 4,
            maxFileBytes: 1024,
            maxTotalSourceBytes: 2048,
            maxStdinBytes: 1024,
            maxArgs: 4,
            maxArgBytes: 128,
          },
          networkPolicy: 'disabled',
          dependencyState: 'ready',
          notes: [],
        },
      ],
    }
    const containerService = new SandboxService({
      inventory: containerInventory,
      env: EXECUTION_ENV,
      now: () => new Date(CHECKED_AT),
      generateExecutionId: () => 'container_unwired',
    })

    const result = await containerService.execute(
      {
        languageId: 'javascript',
        mode: 'run',
        requestedRunnerId: 'container-javascript-test',
        source: "console.log('container')",
      },
      { mode: 'APPROVED_EXECUTION' },
    )

    expect(result.status).toBe('unavailable')
    expect(result.evidence.policyReason).toContain('No executable backend')
  })

  it('covers guarded-host file bundle, test mode, compile mode, timeout, and output truncation branches', async () => {
    const service = await createService(new Map([['node', availability('node')]]), () => 'guarded_paths')

    const filesResult = await service.execute(
      {
        languageId: 'javascript',
        mode: 'run',
        requestedRunnerId: 'guarded-host-javascript',
        files: [
          { path: 'README.md', content: 'not the entry' },
          { path: 'src/app.js', content: "console.log('bundle-file-ok')" },
        ],
      },
      { mode: 'APPROVED_EXECUTION' },
    )
    expect(filesResult.status).toBe('passed')
    expect(filesResult.stdout).toContain('bundle-file-ok')

    const testResult = await service.execute(
      {
        languageId: 'javascript',
        mode: 'test',
        requestedRunnerId: 'guarded-host-javascript',
        source: "console.log('test-mode-ok')",
      },
      { mode: 'APPROVED_EXECUTION' },
    )
    expect(testResult.status).toBe('passed')
    expect(testResult.evidence.verificationLevel).toBe('TESTED')

    const compileResult = await service.execute(
      {
        languageId: 'typescript',
        mode: 'compile',
        requestedRunnerId: 'guarded-host-typescript',
        source: 'const answer: number = 42',
      },
      { mode: 'APPROVED_EXECUTION' },
    )
    expect(compileResult.status).toBe('passed')
    expect(compileResult.evidence.verificationLevel).toBe('COMPILED')

    const truncatedResult = await service.execute(
      {
        languageId: 'javascript',
        mode: 'run',
        requestedRunnerId: 'guarded-host-javascript',
        source: "console.log('x'.repeat(2000))",
        limits: { maxOutputBytes: 32 },
      },
      { mode: 'APPROVED_EXECUTION' },
    )
    expect(truncatedResult.outputTruncated).toBe(true)

    const timeoutResult = await service.execute(
      {
        languageId: 'javascript',
        mode: 'run',
        requestedRunnerId: 'guarded-host-javascript',
        source: 'setInterval(() => {}, 1000)',
        limits: { timeoutMs: 50 },
      },
      { mode: 'APPROVED_EXECUTION' },
    )
    expect(timeoutResult.status).toBe('timeout')
  })

  it('covers container command planner safety branches without executing containers', () => {
    const plan = buildSandboxContainerCommandPlan({
      image: IMAGE,
      engine: AVAILABLE_ENGINE,
      hostWorkspacePath: '/tmp/codemind-sandbox/workspace-coverage',
      containerWorkspacePath: '/workspace/custom',
      entrypoint: ['node', 'main.js'],
    })
    expect(plan.engine).toBe('podman')
    expect(plan.containerWorkspacePath).toBe('/workspace/custom')
    expect(assertContainerCommandPlanStaysNonExecutable(plan)).toBe(false)

    expect(() =>
      buildSandboxContainerCommandPlan({
        image: IMAGE,
        engine: AVAILABLE_ENGINE,
        hostWorkspacePath: '/tmp/codemind-sandbox/root-path',
        entrypoint: [],
      }),
    ).toThrow('requires an entrypoint')

    expect(() =>
      buildSandboxContainerCommandPlan({
        image: IMAGE,
        engine: AVAILABLE_ENGINE,
        hostWorkspacePath: '/tmp/codemind-sandbox/null-path',
        entrypoint: ['node', 'bad\0arg'],
      }),
    ).toThrow('null-byte free')

    expect(() =>
      buildSandboxContainerCommandPlan({
        image: IMAGE,
        engine: AVAILABLE_ENGINE,
        hostWorkspacePath: '/tmp/codemind-sandbox/bad\0path',
        entrypoint: ['node', 'main.js'],
      }),
    ).toThrow('null bytes')

    expect(() =>
      buildSandboxContainerCommandPlan({
        image: IMAGE,
        engine: AVAILABLE_ENGINE,
        hostWorkspacePath: '/',
        entrypoint: ['node', 'main.js'],
      }),
    ).toThrow('filesystem root')

    expect(() =>
      buildSandboxContainerCommandPlan({
        image: IMAGE,
        engine: AVAILABLE_ENGINE,
        hostWorkspacePath: '/tmp/repo/.git/workspace',
        entrypoint: ['node', 'main.js'],
      }),
    ).toThrow('engine socket paths')
  })
})
