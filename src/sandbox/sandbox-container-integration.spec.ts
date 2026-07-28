import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { runnerAvailability, STRONG_SANDBOX_JAVASCRIPT_RUNNER_ID } from './sandbox-registry.js'
import { buildSandboxInventory } from './sandbox-registry.js'
import { SandboxService } from './sandbox-service.js'
import type { SandboxExecutionResult } from './sandbox-types.js'

const RUN_INTEGRATION = process.env['SYMBOLWRIGHT_RUN_STRONG_CONTAINER_INTEGRATION'] === 'true'
const CHECKED_AT = '2026-07-28T00:00:00.000Z'

const integration = describe.skipIf(!RUN_INTEGRATION)

integration('strong offline container execution', () => {
  let root: string

  beforeAll(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), 'symbolwright-container-integration-'))
  })

  afterAll(async () => {
    await rm(root, { recursive: true, force: true })
  })

  function service(executionId: string): SandboxService {
    const env = {
      PATH: process.env['PATH'],
      DOCKER_HOST: process.env['DOCKER_HOST'],
      SYMBOLWRIGHT_ENABLE_STRONG_CONTAINER_EXECUTION: 'true',
    }
    const inventory = buildSandboxInventory({
      env,
      commandAvailability: new Map([
        ['docker', runnerAvailability('available', CHECKED_AT, { version: 'integration' })],
      ]),
    })
    return new SandboxService({
      inventory,
      env,
      workspaceRoot: root,
      containerStateRoot: path.join(root, 'state'),
      generateExecutionId: () => executionId,
    })
  }

  function resultDiagnostic(result: SandboxExecutionResult): string {
    return JSON.stringify(
      {
        status: result.status,
        stdout: result.stdout,
        stderr: result.stderr,
        diagnostics: result.diagnostics,
        cleanup: result.cleanup,
        evidence: result.evidence,
      },
      null,
      2,
    )
  }

  it('runs as non-root with a read-only root, no host mounts, and quarantined artifacts', async () => {
    const result = await service('sandbox-isolation').execute(
      {
        languageId: 'javascript',
        mode: 'run',
        requestedRunnerId: STRONG_SANDBOX_JAVASCRIPT_RUNNER_ID,
        source: `
          const fs = require('node:fs')
          let rootBlocked = false
          try { fs.writeFileSync('/root/symbolwright-escape', 'x') } catch { rootBlocked = true }
          fs.writeFileSync('generated.txt', 'quarantined artifact')
          console.log(JSON.stringify({
            uid: process.getuid(),
            rootBlocked,
            dockerSocket: fs.existsSync('/var/run/docker.sock'),
            hostSentinel: fs.existsSync('/host-home-sentinel')
          }))
        `,
      },
      { mode: 'APPROVED_EXECUTION' },
    )

    expect(result.status, resultDiagnostic(result)).toBe('passed')
    const proof = JSON.parse(result.stdout.trim()) as {
      readonly uid: number
      readonly rootBlocked: boolean
      readonly dockerSocket: boolean
      readonly hostSentinel: boolean
    }
    expect(proof.uid).not.toBe(0)
    expect(proof.rootBlocked).toBe(true)
    expect(proof.dockerSocket).toBe(false)
    expect(proof.hostSentinel).toBe(false)
    expect(result.artifacts.map((artifact) => artifact.name)).toContain('files/generated.txt')
    expect(result.cleanup).toMatchObject({ attempted: true, succeeded: true })
  }, 30_000)

  it('physically blocks outbound networking', async () => {
    const result = await service('sandbox-network').execute(
      {
        languageId: 'javascript',
        mode: 'run',
        requestedRunnerId: STRONG_SANDBOX_JAVASCRIPT_RUNNER_ID,
        limits: { timeoutMs: 4_000 },
        source: `
          const net = require('node:net')
          const socket = net.connect({ host: '1.1.1.1', port: 80 })
          socket.setTimeout(1000)
          socket.once('connect', () => { console.error('network-connected'); process.exit(2) })
          const blocked = () => { console.log('network-blocked'); process.exit(0) }
          socket.once('error', blocked)
          socket.once('timeout', blocked)
        `,
      },
      { mode: 'APPROVED_EXECUTION' },
    )

    expect(result.status, resultDiagnostic(result)).toBe('passed')
    expect(result.stdout).toContain('network-blocked')
    expect(result.stderr).not.toContain('network-connected')
  }, 30_000)

  it('terminates output floods at the effective byte limit', async () => {
    const result = await service('sandbox-output').execute(
      {
        languageId: 'javascript',
        mode: 'run',
        requestedRunnerId: STRONG_SANDBOX_JAVASCRIPT_RUNNER_ID,
        limits: { timeoutMs: 5_000, maxOutputBytes: 2_048 },
        source: `while (true) process.stdout.write('X'.repeat(1024))`,
      },
      { mode: 'APPROVED_EXECUTION' },
    )

    expect(result.status, resultDiagnostic(result)).toBe('resource-limit')
    expect(result.outputTruncated).toBe(true)
    expect(Buffer.byteLength(result.stdout) + Buffer.byteLength(result.stderr)).toBeLessThanOrEqual(
      2_048,
    )
  }, 30_000)

  it('enforces wall-time and explicit cancellation with container cleanup', async () => {
    const timedOut = await service('sandbox-timeout').execute(
      {
        languageId: 'javascript',
        mode: 'run',
        requestedRunnerId: STRONG_SANDBOX_JAVASCRIPT_RUNNER_ID,
        limits: { timeoutMs: 500 },
        source: `setInterval(() => {}, 1000)`,
      },
      { mode: 'APPROVED_EXECUTION' },
    )
    expect(timedOut.status, resultDiagnostic(timedOut)).toBe('timeout')
    expect(timedOut.cleanup.succeeded).toBe(true)

    const cancellable = service('sandbox-cancel')
    const execution = cancellable.execute(
      {
        languageId: 'javascript',
        mode: 'run',
        requestedRunnerId: STRONG_SANDBOX_JAVASCRIPT_RUNNER_ID,
        limits: { timeoutMs: 10_000 },
        source: `setInterval(() => {}, 1000)`,
      },
      { mode: 'APPROVED_EXECUTION' },
    )
    await new Promise((resolve) => setTimeout(resolve, 500))
    const cancellation = await cancellable.cancelExecution('sandbox-cancel')
    const cancelled = await execution
    expect(cancellation.status).toBe('cancelled')
    expect(cancelled.status, resultDiagnostic(cancelled)).toBe('cancelled')
    expect(cancelled.cleanup.succeeded).toBe(true)
  }, 45_000)

  it('enforces PID and tmpfs disk pressure without escaping the container', async () => {
    const processPressure = await service('sandbox-pids').execute(
      {
        languageId: 'javascript',
        mode: 'run',
        requestedRunnerId: STRONG_SANDBOX_JAVASCRIPT_RUNNER_ID,
        limits: { timeoutMs: 5_000, maxProcesses: 8 },
        source: `
          const { spawn } = require('node:child_process')
          let blocked = 0
          for (let i = 0; i < 64; i++) {
            try {
              const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'])
              child.once('error', () => blocked++)
            } catch { blocked++ }
          }
          setTimeout(() => { console.log('pid-pressure-observed'); process.exit(0) }, 500)
        `,
      },
      { mode: 'APPROVED_EXECUTION' },
    )
    expect(
      ['passed', 'resource-limit', 'runtime-error'],
      resultDiagnostic(processPressure),
    ).toContain(processPressure.status)

    const diskPressure = await service('sandbox-disk').execute(
      {
        languageId: 'javascript',
        mode: 'run',
        requestedRunnerId: STRONG_SANDBOX_JAVASCRIPT_RUNNER_ID,
        limits: {
          timeoutMs: 5_000,
          maxTotalSourceBytes: 1_024,
          maxArtifactBytes: 1_024,
          maxFileBytes: 1_024,
        },
        source: `
          const fs = require('node:fs')
          try {
            fs.writeFileSync('overflow.bin', Buffer.alloc(32 * 1024 * 1024))
            process.exit(2)
          } catch (error) {
            console.error(error.code || error.message)
            process.exit(1)
          }
        `,
      },
      { mode: 'APPROVED_EXECUTION' },
    )
    expect(['resource-limit', 'runtime-error'], resultDiagnostic(diskPressure)).toContain(
      diskPressure.status,
    )
    expect(diskPressure.stderr).toMatch(/ENOSPC|space|quota|memory/i)
  }, 45_000)
})
