import { describe, expect, it, vi } from 'vitest'

import { RuntimeMissionTaskExecutor } from './runtime-mission-task-executor.js'
import type { AutonomousTaskNode } from './task-graph.types.js'

const NOW = '2026-07-22T18:00:00.000Z'

function task(
  kind: AutonomousTaskNode['kind'],
  objective: string,
  id = `${kind}-task`,
): AutonomousTaskNode {
  return {
    id,
    objective,
    kind,
    dependencies: [],
    resources: { reads: ['src/**'], writes: kind === 'edit-session' ? ['src/a.ts'] : [] },
    state: 'ready',
    retry: { maxAttempts: 1, attempts: 0 },
    evidence: [],
    artifacts: [],
    failureDiagnostics: [],
    createdAt: NOW,
    updatedAt: NOW,
  }
}

describe('RuntimeMissionTaskExecutor', () => {
  it('records analysis work as completed evidence', async () => {
    const executor = new RuntimeMissionTaskExecutor({
      repositoryRoot: '/repo',
      validationRunner: { run: vi.fn() },
    })

    const result = await executor.execute(
      task('repository-analysis', 'Inspect repository architecture'),
    )

    expect(result.state).toBe('completed')
    expect(result.evidence).toEqual([{ kind: 'tool-call', id: 'analysis-repository-analysis-task' }])
    expect(result.artifacts).toContain('Inspect repository architecture')
  })

  it('blocks repository writes when no real edit strategy is attached', async () => {
    const executor = new RuntimeMissionTaskExecutor({
      repositoryRoot: '/repo',
      validationRunner: { run: vi.fn() },
    })

    const result = await executor.execute(task('edit-session', 'Implement feature'))

    expect(result.state).toBe('blocked')
    expect(result.diagnostics?.join(' ')).toContain('No autonomous edit strategy')
  })

  it('delegates edit and repair work to the configured strategy', async () => {
    const execute = vi.fn(async () => ({
      state: 'completed' as const,
      modifiedFiles: ['src/a.ts'],
    }))
    const executor = new RuntimeMissionTaskExecutor({
      repositoryRoot: '/repo',
      validationRunner: { run: vi.fn() },
      editExecutor: { execute },
    })

    const result = await executor.execute(task('repair', 'Repair validation failure'))

    expect(execute).toHaveBeenCalledOnce()
    expect(result.modifiedFiles).toEqual(['src/a.ts'])
  })

  it('runs validation through the policy-aware validation adapter', async () => {
    const run = vi.fn(async () => ({
      phase: 'validate-1',
      command: 'npm test',
      passed: true,
      exitCode: 0,
      stdout: 'ok',
      stderr: '',
      durationMs: 42,
    }))
    const executor = new RuntimeMissionTaskExecutor({
      repositoryRoot: '/repo',
      validationRunner: { run },
    })

    const result = await executor.execute(task('validation', 'Run npm test', 'validate-1'))

    expect(run).toHaveBeenCalledWith({
      repositoryRoot: '/repo',
      phase: 'validate-1',
      command: 'npm test',
    })
    expect(result.state).toBe('completed')
    expect(result.artifacts).toEqual(['npm test', '42ms'])
  })

  it('returns structured diagnostics for failed validation', async () => {
    const executor = new RuntimeMissionTaskExecutor({
      repositoryRoot: '/repo',
      validationRunner: {
        run: vi.fn(async () => ({
          phase: 'validate-1',
          command: 'npm test',
          passed: false,
          exitCode: 1,
          stdout: '',
          stderr: 'test failure',
          durationMs: 9,
        })),
      },
    })

    const result = await executor.execute(task('validation', 'Run npm test', 'validate-1'))

    expect(result.state).toBe('failed')
    expect(result.diagnostics).toEqual(['test failure'])
  })

  it('rejects validation tasks without an executable command', async () => {
    const executor = new RuntimeMissionTaskExecutor({
      repositoryRoot: '/repo',
      validationRunner: { run: vi.fn() },
    })

    await expect(executor.execute(task('validation', 'Validate repository'))).rejects.toThrow(
      'does not contain an executable command',
    )
  })
})
