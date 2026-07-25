import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { runPreflightCommand } from './cli-preflight.js'

const roots: string[] = []

function makeRepo(scripts: Record<string, string>): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'symbolwright-preflight-cli-'))
  roots.push(root)
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'fixture', scripts }))
  fs.writeFileSync(path.join(root, 'package-lock.json'), 'lock')
  return root
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

describe('runPreflightCommand', () => {
  it('reports READY and non-blocking with no changed files, without touching the sandbox', async () => {
    const result = await runPreflightCommand([], makeRepo({}))
    expect(result.output).toContain('Verdict: READY')
    expect(result.output).toContain('No changed files were provided')
    expect(result.blocking).toBe(false)
  })

  it('reports BLOCKED and sets blocking=true when a changed source file requires missing scripts', async () => {
    const result = await runPreflightCommand(['src/index.ts'], makeRepo({}))
    expect(result.output).toContain('Verdict: BLOCKED')
    expect(result.blocking).toBe(true)
  })
})
