import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import type { RuntimeToolContext } from '../types.js'
import type { SandboxRunner } from '../sandbox/sandbox-runner.js'
import { preflightTool } from './preflight-tool.js'

const roots: string[] = []

function makeRepo(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'symbolwright-preflight-tool-'))
  roots.push(root)
  fs.writeFileSync(
    path.join(root, 'package.json'),
    JSON.stringify({
      name: 'fixture',
      scripts: {
        'format:check': 'true',
        lint: 'true',
        typecheck: 'true',
        test: 'true',
        build: 'true',
      },
    }),
  )
  fs.writeFileSync(path.join(root, 'package-lock.json'), 'lock')
  return root
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

function contextFor(
  cwd: string,
  sandboxRunner: SandboxRunner,
  allowShell = true,
): RuntimeToolContext {
  return {
    cwd,
    policy: {
      mode: 'APPROVED_EXECUTION',
      allowNetwork: false,
      allowReadOnlyNetwork: true,
      allowShell,
      allowWrites: true,
      allowGitHubWrites: false,
      protectedPaths: [],
      noisyDirs: [],
    },
    sandboxRunner,
  }
}

const passingRunner: SandboxRunner = {
  runCommand: async (request) => ({
    outcome: 'EXECUTED',
    runner: 'docker',
    command: `${request.binary} ${request.args.join(' ')}`,
    stdout: '',
    stderr: '',
    exitCode: 0,
    reason: null,
  }),
}

describe('preflightTool', () => {
  it('refuses to run when shell execution is disallowed by policy', async () => {
    const result = await preflightTool.execute(
      { changedFiles: ['src/index.ts'] },
      contextFor(makeRepo(), passingRunner, false),
    )
    expect(result).toContain('requires shell execution to be allowed')
  })

  it('produces a READY verdict when all required scripts pass', async () => {
    const result = await preflightTool.execute(
      { changedFiles: ['src/index.ts'] },
      contextFor(makeRepo(), passingRunner),
    )
    expect(result).toContain('Verdict: READY')
    expect(result).toContain('Push recommendation: SAFE_TO_PUSH')
  })

  it('throws when changedFiles is not an array of strings', async () => {
    await expect(
      preflightTool.execute(
        { changedFiles: 'not-an-array' },
        contextFor(makeRepo(), passingRunner),
      ),
    ).rejects.toThrow('preflight requires "changedFiles" to be an array of strings.')
  })

  it('throws when input is not an object', async () => {
    await expect(
      preflightTool.execute(null, contextFor(makeRepo(), passingRunner)),
    ).rejects.toThrow('Missing preflight input.')
  })
})
