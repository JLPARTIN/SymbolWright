import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { runGitCommand } from '../../runtime/git/git-command-runner.js'
import { startChatServer, type StartedChatServer } from '../../server/symbolwright-chat-server.js'
import { UnlimitedRateLimiter } from '../../server/rate-limiter.js'

const API_KEY = 'github-intake-api-test-key'
let root: string
let started: StartedChatServer | undefined

function auth(): Record<string, string> {
  return { authorization: `Bearer ${API_KEY}`, 'content-type': 'application/json' }
}

describe('GitHub intake API routes', () => {
  beforeEach(async () => {
    root = mkdtempSync(join(tmpdir(), 'symbolwright-github-intake-api-'))
    await runGitCommand(['init'], root)
    await runGitCommand(['config', 'user.email', 'test@example.com'], root)
    await runGitCommand(['config', 'user.name', 'Test'], root)
    writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'x' }))
    await runGitCommand(['add', 'package.json'], root)
    await runGitCommand(['commit', '-m', 'initial'], root)
    await runGitCommand(['branch', '-m', 'main'], root)
    await runGitCommand(
      ['remote', 'add', 'origin', 'https://github.com/JLPARTIN/SymbolWright.git'],
      root,
    )
    started = await startChatServer({
      apiKey: API_KEY,
      host: '127.0.0.1',
      port: 0,
      cwd: root,
      env: {},
      rateLimiter: new UnlimitedRateLimiter(),
    })
  })

  afterEach(async () => {
    if (started) await new Promise<void>((resolve) => started!.server.close(() => resolve()))
    started = undefined
    rmSync(root, { recursive: true, force: true })
  })

  it('requires authentication', async () => {
    const response = await fetch(`${started!.url}/api/github/intake`, {
      method: 'POST',
      body: JSON.stringify({ target: 'JLPARTIN/SymbolWright', mode: 'dry-run', objective: 'x' }),
    })
    expect(response.status).toBe(401)
  })

  it('performs a real dry-run intake with no network access, returning the parsed target and plan', async () => {
    const response = await fetch(`${started!.url}/api/github/intake`, {
      method: 'POST',
      headers: auth(),
      body: JSON.stringify({ target: 'JLPARTIN/SymbolWright', mode: 'dry-run', objective: 'x' }),
    })
    expect(response.status).toBe(200)
    const body = (await response.json()) as {
      target: { owner: string; repo: string }
      acquisition: { acquired: boolean }
      mission?: unknown
    }
    expect(body.target.owner).toBe('JLPARTIN')
    expect(body.target.repo).toBe('SymbolWright')
    expect(body.acquisition.acquired).toBe(false)
    expect(body.mission).toBeUndefined()
  })

  it('rejects a malicious target with a 400 rather than attempting acquisition', async () => {
    const response = await fetch(`${started!.url}/api/github/intake`, {
      method: 'POST',
      headers: auth(),
      body: JSON.stringify({ target: 'owner/repo; rm -rf /', mode: 'dry-run', objective: 'x' }),
    })
    expect(response.status).toBe(400)
  })

  it('rejects a missing objective', async () => {
    const response = await fetch(`${started!.url}/api/github/intake`, {
      method: 'POST',
      headers: auth(),
      body: JSON.stringify({ target: 'JLPARTIN/SymbolWright', mode: 'dry-run' }),
    })
    expect(response.status).toBe(400)
  })

  it('rejects an invalid mode', async () => {
    const response = await fetch(`${started!.url}/api/github/intake`, {
      method: 'POST',
      headers: auth(),
      body: JSON.stringify({
        target: 'JLPARTIN/SymbolWright',
        mode: 'destroy-everything',
        objective: 'x',
      }),
    })
    expect(response.status).toBe(400)
  })

  it('rejects an unknown enabledOperations entry rather than silently ignoring it', async () => {
    const response = await fetch(`${started!.url}/api/github/intake`, {
      method: 'POST',
      headers: auth(),
      body: JSON.stringify({
        target: 'JLPARTIN/SymbolWright',
        mode: 'dry-run',
        objective: 'x',
        enabledOperations: ['delete_the_universe'],
      }),
    })
    expect(response.status).toBe(400)
  })

  it('builds a real PR operation packet for an existing mission via local branch/commit', async () => {
    const created = await fetch(`${started!.url}/api/missions`, {
      method: 'POST',
      headers: auth(),
      body: JSON.stringify({
        name: 'Test mission',
        objective: 'Fix the thing',
        workspaceKind: 'repository',
        repositoryPath: '.',
        runtimeMode: 'READ_ONLY',
      }),
    })
    expect(created.status).toBe(201)
    const mission = (await created.json()) as { mission: { id: string } }

    writeFileSync(join(root, 'b.txt'), 'new file')

    const packetResponse = await fetch(
      `${started!.url}/api/missions/${mission.mission.id}/github-pr-packet`,
      { method: 'POST', headers: auth(), body: JSON.stringify({}) },
    )
    expect(packetResponse.status).toBe(200)
    const body = (await packetResponse.json()) as {
      packet: { branchCreated: boolean; stagedFiles: string[]; commitCreated: boolean }
    }
    expect(body.packet.branchCreated).toBe(true)
    expect(body.packet.stagedFiles).toContain('b.txt')
    expect(body.packet.commitCreated).toBe(true)
  })

  it('never stages legacy CodeMind state (.codemind/) into a PR operation packet', async () => {
    // Regression test: the changed-file filter previously excluded `.symbolwright/` twice
    // instead of also excluding `.codemind/`, so pre-rebrand runtime state left in a repository
    // could be swept into a generated PR packet.
    const created = await fetch(`${started!.url}/api/missions`, {
      method: 'POST',
      headers: auth(),
      body: JSON.stringify({
        name: 'Test mission',
        objective: 'Fix the thing',
        workspaceKind: 'repository',
        repositoryPath: '.',
        runtimeMode: 'READ_ONLY',
      }),
    })
    expect(created.status).toBe(201)
    const mission = (await created.json()) as { mission: { id: string } }

    mkdirSync(join(root, '.codemind'), { recursive: true })
    writeFileSync(join(root, '.codemind', 'legacy-state.json'), '{}')
    writeFileSync(join(root, 'b.txt'), 'new file')

    const packetResponse = await fetch(
      `${started!.url}/api/missions/${mission.mission.id}/github-pr-packet`,
      { method: 'POST', headers: auth(), body: JSON.stringify({}) },
    )
    expect(packetResponse.status).toBe(200)
    const body = (await packetResponse.json()) as {
      packet: { stagedFiles: string[] }
    }
    expect(body.packet.stagedFiles).toContain('b.txt')
    expect(body.packet.stagedFiles.some((path) => path.startsWith('.codemind'))).toBe(false)
  })

  it('returns 404 for a PR packet request against a nonexistent mission', async () => {
    const response = await fetch(
      `${started!.url}/api/missions/mission_00000000-0000-4000-8000-000000000000/github-pr-packet`,
      { method: 'POST', headers: auth(), body: JSON.stringify({}) },
    )
    expect(response.status).toBe(404)
  })

  it('reports blocked (never fake success) when publishing without enabling write policy', async () => {
    const created = await fetch(`${started!.url}/api/missions`, {
      method: 'POST',
      headers: auth(),
      body: JSON.stringify({
        name: 'Test mission',
        objective: 'Fix the thing',
        workspaceKind: 'repository',
        repositoryPath: '.',
        runtimeMode: 'READ_ONLY',
      }),
    })
    const mission = (await created.json()) as { mission: { id: string } }

    const publishResponse = await fetch(
      `${started!.url}/api/missions/${mission.mission.id}/github-pr-packet/publish`,
      {
        method: 'POST',
        headers: auth(),
        body: JSON.stringify({
          packet: {
            branchName: 'symbolwright/x',
            baseBranch: 'main',
            prTitle: 't',
            prBody: 'b',
          },
        }),
      },
    )
    expect(publishResponse.status).toBe(200)
    const body = (await publishResponse.json()) as { branchResult: { status: string } }
    expect(body.branchResult.status).toBe('blocked')
  })

  it('reports unavailable (never fake success) when publishing is enabled but no GITHUB_TOKEN is configured', async () => {
    const created = await fetch(`${started!.url}/api/missions`, {
      method: 'POST',
      headers: auth(),
      body: JSON.stringify({
        name: 'Test mission',
        objective: 'Fix the thing',
        workspaceKind: 'repository',
        repositoryPath: '.',
        runtimeMode: 'READ_ONLY',
      }),
    })
    const mission = (await created.json()) as { mission: { id: string } }

    const publishResponse = await fetch(
      `${started!.url}/api/missions/${mission.mission.id}/github-pr-packet/publish`,
      {
        method: 'POST',
        headers: auth(),
        body: JSON.stringify({
          enabledOperations: ['push_branch', 'open_pull_request'],
          packet: {
            branchName: 'symbolwright/x',
            baseBranch: 'main',
            prTitle: 't',
            prBody: 'b',
          },
        }),
      },
    )
    expect(publishResponse.status).toBe(200)
    const body = (await publishResponse.json()) as { branchResult: { status: string } }
    expect(body.branchResult.status).toBe('unavailable')
  })
})
