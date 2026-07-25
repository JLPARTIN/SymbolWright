import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { GitHubAppInstallationNotFoundError } from '../github/github-app-token-provider.js'
import { runGitCommand } from '../runtime/git/git-command-runner.js'
import { UnlimitedRateLimiter } from './rate-limiter.js'
import { startChatServer, type StartedChatServer } from './symbolwright-chat-server.js'

vi.setConfig({ testTimeout: 20_000 })

const API_KEY = 'github-app-delegation-test-key'
let started: StartedChatServer | undefined
let cwd: string

beforeEach(async () => {
  cwd = mkdtempSync(join(tmpdir(), 'symbolwright-github-app-delegation-'))
  await runGitCommand(['init'], cwd)
  await runGitCommand(['config', 'user.email', 'test@example.com'], cwd)
  await runGitCommand(['config', 'user.name', 'Test'], cwd)
  await runGitCommand(['remote', 'add', 'origin', 'https://github.com/acme/widgets.git'], cwd)
  writeFileSync(join(cwd, 'README.md'), 'hello\n')
  await runGitCommand(['add', '.'], cwd)
  await runGitCommand(['commit', '-m', 'initial'], cwd)
})

afterEach(async () => {
  if (started !== undefined) {
    await new Promise<void>((resolve) => started?.server.close(() => resolve()))
    started = undefined
  }
  rmSync(cwd, { recursive: true, force: true })
  vi.unstubAllGlobals()
})

function auth(): Record<string, string> {
  return { authorization: `Bearer ${API_KEY}`, 'content-type': 'application/json' }
}

describe('GitHub App installation-token delegation for real PR creation', () => {
  it('uses the resolved GitHub App installation token as the Authorization header for the real GitHub API calls', async () => {
    const capturedAuthorizations: string[] = []
    const realFetch = globalThis.fetch.bind(globalThis)
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL, init?: RequestInit) => {
        const url = String(input)
        if (!url.startsWith('https://api.github.com')) {
          // Only intercept the outbound GitHub API calls made by DefaultGitHubHttpClient — the
          // test's own request to the local server must reach the real local listener.
          return realFetch(input, init)
        }
        const headers = init?.headers as Record<string, string> | undefined
        capturedAuthorizations.push(headers?.['Authorization'] ?? '')
        if (url.includes('/git/ref/heads/main')) {
          return new Response(JSON.stringify({ object: { sha: 'base-sha' } }), { status: 200 })
        }
        if (url.endsWith('/git/refs')) {
          return new Response('{}', { status: 201 })
        }
        return new Response('{}', { status: 404 })
      }),
    )

    started = await startChatServer({
      apiKey: API_KEY,
      host: '127.0.0.1',
      port: 0,
      env: {},
      cwd,
      rateLimiter: new UnlimitedRateLimiter(),
      githubTokenResolver: async (repository) => {
        expect(repository).toBe('acme/widgets')
        return 'ghs_installation_scoped_token'
      },
    })

    await fetch(`${started.url}/api/repository/pull-request`, {
      method: 'POST',
      headers: auth(),
      body: JSON.stringify({
        confirm: true,
        repository: 'acme/widgets',
        baseBranch: 'main',
        headBranch: 'feat/app-token-test',
        title: 'Test PR',
        files: [{ path: 'a.txt', content: 'x' }],
      }),
    })

    expect(capturedAuthorizations).toContain('Bearer ghs_installation_scoped_token')
  })

  it('returns a clean 502 (not a crash) when the App has no installation covering the repository, and never falls back silently', async () => {
    started = await startChatServer({
      apiKey: API_KEY,
      host: '127.0.0.1',
      port: 0,
      env: {},
      cwd,
      rateLimiter: new UnlimitedRateLimiter(),
      githubTokenResolver: async () => {
        throw new GitHubAppInstallationNotFoundError('No installation covers acme/widgets.')
      },
    })

    const response = await fetch(`${started.url}/api/repository/pull-request`, {
      method: 'POST',
      headers: auth(),
      body: JSON.stringify({
        confirm: true,
        repository: 'acme/widgets',
        baseBranch: 'main',
        headBranch: 'feat/x',
        title: 'Test PR',
        files: [{ path: 'a.txt', content: 'x' }],
      }),
    })

    expect(response.status).toBe(502)
    const body = (await response.json()) as { error: string }
    expect(body.error).toContain('No installation covers')
  })
})
