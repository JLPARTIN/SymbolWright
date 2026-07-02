import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import type { SandboxRunner } from '../runtime/sandbox/sandbox-runner.js'
import { runPreflight } from './preflight-runner.js'

const roots: string[] = []

function makeRepo(options: {
  readonly scripts?: Record<string, string>
  readonly ledger?: unknown
  readonly lockfile?: string
}): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'codemind-preflight-'))
  roots.push(root)
  fs.writeFileSync(
    path.join(root, 'package.json'),
    JSON.stringify({ name: 'fixture', scripts: options.scripts ?? {} }),
  )
  fs.writeFileSync(path.join(root, options.lockfile ?? 'package-lock.json'), 'lock')
  if (options.ledger !== undefined) {
    fs.mkdirSync(path.join(root, '.codemind'), { recursive: true })
    fs.writeFileSync(
      path.join(root, '.codemind', 'ci-failure-ledger.json'),
      JSON.stringify(options.ledger),
    )
  }
  return root
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

function sandboxRunnerReturning(exitCode: number): SandboxRunner {
  return {
    runCommand: async (request) => ({
      outcome: 'EXECUTED',
      runner: 'docker',
      command: `${request.binary} ${request.args.join(' ')}`,
      stdout: '',
      stderr: '',
      exitCode,
      reason: null,
    }),
  }
}

describe('runPreflight', () => {
  it('reports READY when all required scripts pass in the sandbox', async () => {
    const root = makeRepo({
      scripts: {
        'format:check': 'true',
        lint: 'true',
        typecheck: 'true',
        test: 'true',
        build: 'true',
      },
    })

    const report = await runPreflight(['src/index.ts'], root, sandboxRunnerReturning(0))

    expect(report.verdict).toBe('READY')
    expect(report.pushRecommendation).toBe('SAFE_TO_PUSH')
    expect(report.validationCommands.every((c) => c.status === 'passed')).toBe(true)
  })

  it('reports BLOCKED when a required script is missing from package.json', async () => {
    const root = makeRepo({ scripts: {} })

    const report = await runPreflight(['src/index.ts'], root, sandboxRunnerReturning(0))

    expect(report.verdict).toBe('BLOCKED')
    expect(report.pushRecommendation).toBe('DO_NOT_PUSH')
  })

  it('reports NEEDS_WORK when a required script fails', async () => {
    const root = makeRepo({
      scripts: {
        'format:check': 'true',
        lint: 'true',
        typecheck: 'true',
        test: 'true',
        build: 'true',
      },
    })

    const report = await runPreflight(['src/index.ts'], root, sandboxRunnerReturning(1))

    expect(report.verdict).toBe('NEEDS_WORK')
  })

  it('matches active failure-ledger rules against changed files and requires the prevention proof', async () => {
    const root = makeRepo({
      scripts: { 'format:check': 'true' },
      ledger: {
        schemaVersion: 1,
        failures: [
          {
            failureClass: 'FORMAT_CHECK_FAILURE',
            rootCause: 'drift',
            preventionRule: 'run format:check',
            regressionTest: 'spec',
            firstSeen: '2026-06-30',
            status: 'active',
            affectedFilePatterns: ['**/*.ts'],
          },
        ],
      },
    })

    const report = await runPreflight(['src/index.ts'], root, sandboxRunnerReturning(0))

    expect(report.failuresPrevented).toContain('FORMAT_CHECK_FAILURE')
  })

  it('returns READY with no validation commands when no files changed', async () => {
    const root = makeRepo({ scripts: {} })

    const report = await runPreflight([], root, sandboxRunnerReturning(0))

    expect(report.changedFiles).toHaveLength(0)
    expect(report.verdict).toBe('READY')
  })

  it('treats an unparsable package.json as having no available scripts', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'codemind-preflight-broken-'))
    roots.push(root)
    fs.writeFileSync(path.join(root, 'package.json'), '{ not valid json')
    fs.writeFileSync(path.join(root, 'package-lock.json'), 'lock')

    const report = await runPreflight(['src/index.ts'], root, sandboxRunnerReturning(0))

    expect(report.verdict).toBe('BLOCKED')
  })
})
