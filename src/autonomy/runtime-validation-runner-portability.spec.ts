import path from 'node:path'

import { describe, expect, it, vi } from 'vitest'

import type { PortableValidationRunner } from '../portability/portable-validation-runner.js'
import { createRuntimePolicyForMode } from '../runtime/policy/runtime-policy.js'
import { RuntimeAutonomousValidationRunner } from './runtime-validation-runner.js'

describe('RuntimeAutonomousValidationRunner portability', () => {
  it('executes an encoded nested-package command from the resolved package root', async () => {
    const run = vi.fn<PortableValidationRunner['run']>(async (request) => ({
      outcome: 'PASS',
      command: request.command,
      image: 'python:3.12-bookworm',
      exitCode: 0,
      stdout: '3 passed',
      stderr: '',
      durationMs: 27,
    }))
    const repositoryRoot = path.resolve('/tmp/codemind-mixed-repository')
    const command = 'codemind-cwd:services/api::python -m pytest'
    const runner = new RuntimeAutonomousValidationRunner({
      policy: createRuntimePolicyForMode('APPROVED_EXECUTION'),
      portableRunner: { run },
    })

    const result = await runner.run({ repositoryRoot, phase: 'test', command })

    expect(run).toHaveBeenCalledWith({
      repositoryRoot: path.join(repositoryRoot, 'services/api'),
      command: 'python -m pytest',
      policy: expect.objectContaining({ allowShell: true }),
    })
    expect(result).toEqual({
      phase: 'test',
      command,
      passed: true,
      exitCode: 0,
      stdout: '3 passed',
      stderr: '',
      durationMs: 27,
    })
  })

  it('rejects a malformed package invocation before execution', async () => {
    const run = vi.fn<PortableValidationRunner['run']>()
    const runner = new RuntimeAutonomousValidationRunner({
      policy: createRuntimePolicyForMode('APPROVED_EXECUTION'),
      portableRunner: { run },
    })

    const result = await runner.run({
      repositoryRoot: '/tmp/codemind-mixed-repository',
      phase: 'test',
      command: 'codemind-cwd:services/api',
    })

    expect(result.passed).toBe(false)
    expect(result.stderr).toContain('malformed')
    expect(run).not.toHaveBeenCalled()
  })
})
