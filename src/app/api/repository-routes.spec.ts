import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { runGitCommand } from '../../runtime/git/git-command-runner.js'
import { startChatServer, type StartedChatServer } from '../../server/codemind-chat-server.js'
import { UnlimitedRateLimiter } from '../../server/rate-limiter.js'

const API_KEY = 'test-codemind-key'

let started: StartedChatServer | undefined
let cwd: string

beforeEach(async () => {
  cwd = mkdtempSync(join(tmpdir(), 'codemind-repository-routes-'))
  await runGitCommand(['init'], cwd)
  await runGitCommand(['config', 'user.email', 'test@example.com'], cwd)
  await runGitCommand(['config', 'user.name', 'Test'], cwd)
})

afterEach(async () => {
  if (started !== undefined) {
    await new Promise<void>((resolve) => started?.server.close(() => resolve()))
    started = undefined
  }
  rmSync(cwd, { recursive: true, force: true })
})

async function launch() {
  started = await startChatServer({
    apiKey: API_KEY,
    host: '127.0.0.1',
    port: 0,
    env: {},
    cwd,
    rateLimiter: new UnlimitedRateLimiter(),
  })
  return started
}

function auth(): Record<string, string> {
  return { authorization: `Bearer ${API_KEY}` }
}

describe('GET /api/repository/tree', () => {
  it('requires authentication', async () => {
    const server = await launch()
    const response = await fetch(`${server.url}/api/repository/tree`)
    expect(response.status).toBe(401)
  })

  it('lists one directory level, directories before files, and skips noisy dirs', async () => {
    writeFileSync(join(cwd, 'b.ts'), '')
    writeFileSync(join(cwd, 'a.ts'), '')
    mkdirSync(join(cwd, 'src'))
    mkdirSync(join(cwd, 'node_modules'))

    const server = await launch()
    const response = await fetch(`${server.url}/api/repository/tree`, { headers: auth() })
    expect(response.status).toBe(200)
    const body = (await response.json()) as {
      entries: readonly { name: string; type: string }[]
    }
    expect(body.entries.map((e) => e.name)).toEqual(['src', 'a.ts', 'b.ts'])
    expect(body.entries.find((e) => e.name === 'node_modules')).toBeUndefined()
  })

  it('rejects a directory that resolves outside the workspace', async () => {
    const server = await launch()
    const response = await fetch(
      `${server.url}/api/repository/tree?dir=${encodeURIComponent('../../etc')}`,
      { headers: auth() },
    )
    expect(response.status).toBe(400)
  })

  it('blocks a protected path like .git', async () => {
    const server = await launch()
    const response = await fetch(`${server.url}/api/repository/tree?dir=.git`, { headers: auth() })
    expect(response.status).toBe(400)
  })
})

describe('GET /api/repository/file', () => {
  it('requires authentication', async () => {
    const server = await launch()
    const response = await fetch(`${server.url}/api/repository/file?path=a.ts`)
    expect(response.status).toBe(401)
  })

  it('reads a real file and returns a content hash', async () => {
    writeFileSync(join(cwd, 'a.ts'), 'export const a = 1\n')
    const server = await launch()
    const response = await fetch(`${server.url}/api/repository/file?path=a.ts`, { headers: auth() })
    expect(response.status).toBe(200)
    const body = (await response.json()) as { content: string; contentHash: string }
    expect(body.content).toBe('export const a = 1\n')
    expect(body.contentHash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('returns 404 for a missing file', async () => {
    const server = await launch()
    const response = await fetch(`${server.url}/api/repository/file?path=missing.ts`, {
      headers: auth(),
    })
    expect(response.status).toBe(404)
  })
})

describe('GET /api/repository/status', () => {
  it('requires authentication', async () => {
    const server = await launch()
    const response = await fetch(`${server.url}/api/repository/status`)
    expect(response.status).toBe(401)
  })

  it('reports untracked files and the current branch', async () => {
    writeFileSync(join(cwd, 'new.txt'), 'hello')
    const server = await launch()
    const response = await fetch(`${server.url}/api/repository/status`, { headers: auth() })
    expect(response.status).toBe(200)
    const body = (await response.json()) as {
      summary: { untracked: readonly { path: string }[] }
      currentBranch: string
    }
    expect(body.summary.untracked.map((e) => e.path)).toEqual(['new.txt'])
    expect(typeof body.currentBranch).toBe('string')
  })
})

describe('GET /api/repository/diff', () => {
  it('requires authentication', async () => {
    const server = await launch()
    const response = await fetch(`${server.url}/api/repository/diff`)
    expect(response.status).toBe(401)
  })

  it('returns a unified diff for an unstaged change to one file', async () => {
    writeFileSync(join(cwd, 'a.ts'), 'const a = 1\n')
    await runGitCommand(['add', 'a.ts'], cwd)
    await runGitCommand(['commit', '-m', 'init'], cwd)
    writeFileSync(join(cwd, 'a.ts'), 'const a = 2\n')

    const server = await launch()
    const response = await fetch(`${server.url}/api/repository/diff?path=a.ts`, { headers: auth() })
    expect(response.status).toBe(200)
    const body = (await response.json()) as { diff: string }
    expect(body.diff).toContain('-const a = 1')
    expect(body.diff).toContain('+const a = 2')
  })
})

describe('GET /api/repository/branches', () => {
  it('requires authentication', async () => {
    const server = await launch()
    const response = await fetch(`${server.url}/api/repository/branches`)
    expect(response.status).toBe(401)
  })

  it('reports the current branch after an initial commit', async () => {
    writeFileSync(join(cwd, 'a.ts'), 'const a = 1\n')
    await runGitCommand(['add', 'a.ts'], cwd)
    await runGitCommand(['commit', '-m', 'init'], cwd)

    const server = await launch()
    const response = await fetch(`${server.url}/api/repository/branches`, { headers: auth() })
    expect(response.status).toBe(200)
    const body = (await response.json()) as { branches: readonly string[]; current: string }
    expect(body.branches).toContain(body.current)
    expect(body.current.length).toBeGreaterThan(0)
  })
})
