import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createCheckpoint, listCheckpoints } from '../../checkpoint/checkpoint-service.js'
import { FakeGitHubPrCreationClient } from '../../runtime/github-write/fake-github-pr-creation-client.js'
import { runGitCommand } from '../../runtime/git/git-command-runner.js'
import { startChatServer, type StartedChatServer } from '../../server/codemind-chat-server.js'
import { UnlimitedRateLimiter } from '../../server/rate-limiter.js'
import { parseGitHubRemoteUrl } from './repository-routes.js'

// Many tests here spawn several real `git` subprocesses per test (init,
// commit, branch, push against a real bare "remote", etc.); under coverage
// instrumentation and parallel test-file execution that can legitimately
// exceed vitest's default 5000ms, independent of any logic bug.
vi.setConfig({ testTimeout: 20_000 })

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

describe('PUT /api/repository/file', () => {
  it('requires authentication', async () => {
    const server = await launch()
    const response = await fetch(`${server.url}/api/repository/file`, { method: 'PUT' })
    expect(response.status).toBe(401)
  })

  it('creates a new file and takes a checkpoint', async () => {
    const server = await launch()
    const response = await fetch(`${server.url}/api/repository/file`, {
      method: 'PUT',
      headers: { ...auth(), 'content-type': 'application/json' },
      body: JSON.stringify({ path: 'new.ts', content: 'export const a = 1\n' }),
    })
    expect(response.status).toBe(200)
    const body = (await response.json()) as { contentHash: string; existedBefore: boolean }
    expect(body.existedBefore).toBe(false)

    expect(readFileSync(join(cwd, 'new.ts'), 'utf-8')).toBe('export const a = 1\n')
    expect(listCheckpoints(cwd)).toHaveLength(1)
  })

  it('overwrites an existing file when no baseContentHash is given', async () => {
    writeFileSync(join(cwd, 'a.ts'), 'const a = 1\n')
    const server = await launch()
    const response = await fetch(`${server.url}/api/repository/file`, {
      method: 'PUT',
      headers: { ...auth(), 'content-type': 'application/json' },
      body: JSON.stringify({ path: 'a.ts', content: 'const a = 2\n' }),
    })
    expect(response.status).toBe(200)
    expect(readFileSync(join(cwd, 'a.ts'), 'utf-8')).toBe('const a = 2\n')
  })

  it('returns 409 and the current content when the file changed on disk since it was loaded', async () => {
    writeFileSync(join(cwd, 'a.ts'), 'const a = 1\n')
    const server = await launch()

    const readResponse = await fetch(`${server.url}/api/repository/file?path=a.ts`, {
      headers: auth(),
    })
    const { contentHash } = (await readResponse.json()) as { contentHash: string }

    // Simulate an external change made after the client loaded the file.
    writeFileSync(join(cwd, 'a.ts'), 'const a = 999\n')

    const writeResponse = await fetch(`${server.url}/api/repository/file`, {
      method: 'PUT',
      headers: { ...auth(), 'content-type': 'application/json' },
      body: JSON.stringify({
        path: 'a.ts',
        content: 'const a = 2\n',
        baseContentHash: contentHash,
      }),
    })
    expect(writeResponse.status).toBe(409)
    const body = (await writeResponse.json()) as { currentContent: string }
    expect(body.currentContent).toBe('const a = 999\n')
    // The conflicting write must not have happened.
    expect(readFileSync(join(cwd, 'a.ts'), 'utf-8')).toBe('const a = 999\n')
  })

  it('succeeds when baseContentHash matches the current on-disk content', async () => {
    writeFileSync(join(cwd, 'a.ts'), 'const a = 1\n')
    const server = await launch()

    const readResponse = await fetch(`${server.url}/api/repository/file?path=a.ts`, {
      headers: auth(),
    })
    const { contentHash } = (await readResponse.json()) as { contentHash: string }

    const writeResponse = await fetch(`${server.url}/api/repository/file`, {
      method: 'PUT',
      headers: { ...auth(), 'content-type': 'application/json' },
      body: JSON.stringify({
        path: 'a.ts',
        content: 'const a = 2\n',
        baseContentHash: contentHash,
      }),
    })
    expect(writeResponse.status).toBe(200)
    expect(readFileSync(join(cwd, 'a.ts'), 'utf-8')).toBe('const a = 2\n')
  })

  it('rejects a write outside the workspace', async () => {
    const server = await launch()
    const response = await fetch(`${server.url}/api/repository/file`, {
      method: 'PUT',
      headers: { ...auth(), 'content-type': 'application/json' },
      body: JSON.stringify({ path: '../../etc/passwd', content: 'x' }),
    })
    expect(response.status).toBe(400)
  })
})

describe('POST /api/repository/branches', () => {
  it('requires authentication', async () => {
    const server = await launch()
    const response = await fetch(`${server.url}/api/repository/branches`, { method: 'POST' })
    expect(response.status).toBe(401)
  })

  it('creates and switches to a new branch', async () => {
    writeFileSync(join(cwd, 'a.ts'), 'const a = 1\n')
    await runGitCommand(['add', 'a.ts'], cwd)
    await runGitCommand(['commit', '-m', 'init'], cwd)

    const server = await launch()
    const response = await fetch(`${server.url}/api/repository/branches`, {
      method: 'POST',
      headers: { ...auth(), 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'feature/test' }),
    })
    expect(response.status).toBe(200)

    const current = await runGitCommand(['branch', '--show-current'], cwd)
    expect(current.stdout.trim()).toBe('feature/test')
  })

  it('blocks creating a branch named after a protected ref', async () => {
    const server = await launch()
    const response = await fetch(`${server.url}/api/repository/branches`, {
      method: 'POST',
      headers: { ...auth(), 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'main' }),
    })
    expect(response.status).toBe(403)
  })
})

describe('POST /api/repository/commit', () => {
  it('requires authentication', async () => {
    const server = await launch()
    const response = await fetch(`${server.url}/api/repository/commit`, { method: 'POST' })
    expect(response.status).toBe(401)
  })

  it('stages and commits all changes when files is omitted', async () => {
    writeFileSync(join(cwd, 'a.ts'), 'const a = 1\n')
    const server = await launch()
    const response = await fetch(`${server.url}/api/repository/commit`, {
      method: 'POST',
      headers: { ...auth(), 'content-type': 'application/json' },
      body: JSON.stringify({ message: 'add a.ts' }),
    })
    expect(response.status).toBe(200)

    const log = await runGitCommand(['log', '--oneline'], cwd)
    expect(log.stdout).toContain('add a.ts')
  })

  it('commits only the specified files, leaving others unstaged', async () => {
    writeFileSync(join(cwd, 'a.ts'), 'a')
    writeFileSync(join(cwd, 'b.ts'), 'b')
    const server = await launch()
    const response = await fetch(`${server.url}/api/repository/commit`, {
      method: 'POST',
      headers: { ...auth(), 'content-type': 'application/json' },
      body: JSON.stringify({ message: 'add a only', files: ['a.ts'] }),
    })
    expect(response.status).toBe(200)

    const status = await runGitCommand(['status', '--porcelain=v1'], cwd)
    expect(status.stdout).toContain('?? b.ts')
    expect(status.stdout).not.toContain('a.ts')
  })

  it('returns 400 when there is nothing to commit', async () => {
    const server = await launch()
    const response = await fetch(`${server.url}/api/repository/commit`, {
      method: 'POST',
      headers: { ...auth(), 'content-type': 'application/json' },
      body: JSON.stringify({ message: 'empty' }),
    })
    expect(response.status).toBe(400)
  })

  it('never sweeps CodeMind checkpoint state (.codemind/) into a commit made with files omitted', async () => {
    // A prior write through PUT /api/repository/file creates .codemind/checkpoints/... --
    // "commit everything" must not check that internal state into the user's real history.
    const putResponse = await fetch(`${(await launch()).url}/api/repository/file`, {
      method: 'PUT',
      headers: { ...auth(), 'content-type': 'application/json' },
      body: JSON.stringify({ path: 'a.ts', content: 'const a = 1\n' }),
    })
    expect(putResponse.status).toBe(200)

    const response = await fetch(`${started?.url}/api/repository/commit`, {
      method: 'POST',
      headers: { ...auth(), 'content-type': 'application/json' },
      body: JSON.stringify({ message: 'add a.ts' }),
    })
    expect(response.status).toBe(200)

    const show = await runGitCommand(['show', '--stat', 'HEAD'], cwd)
    expect(show.stdout).toContain('a.ts')
    expect(show.stdout).not.toContain('.codemind')

    const status = await runGitCommand(['status', '--porcelain=v1'], cwd)
    expect(status.stdout).toContain('.codemind')
  })
})

describe('POST /api/repository/checkpoints/:id/restore', () => {
  it('requires authentication', async () => {
    const server = await launch()
    const response = await fetch(
      `${server.url}/api/repository/checkpoints/does-not-exist/restore`,
      {
        method: 'POST',
      },
    )
    expect(response.status).toBe(401)
  })

  it('restores a checkpointed file back to its pre-write content', async () => {
    const filePath = join(cwd, 'a.ts')
    writeFileSync(filePath, 'const a = 1\n')

    const checkpoint = createCheckpoint({
      workspaceRoot: cwd,
      sessionId: 'cm-test',
      tool: 'edit_file',
      files: [
        {
          targetPath: 'a.ts',
          resolvedPath: filePath,
          existedBefore: true,
          originalContent: 'const a = 1\n',
        },
      ],
    })

    writeFileSync(filePath, 'const a = 999 // mistake\n')

    const server = await launch()
    const response = await fetch(
      `${server.url}/api/repository/checkpoints/${checkpoint.checkpointId}/restore`,
      { method: 'POST', headers: auth() },
    )
    expect(response.status).toBe(200)
    expect(readFileSync(filePath, 'utf-8')).toBe('const a = 1\n')
  })

  it('returns 404 for an unknown checkpoint', async () => {
    const server = await launch()
    const response = await fetch(
      `${server.url}/api/repository/checkpoints/does-not-exist/restore`,
      {
        method: 'POST',
        headers: auth(),
      },
    )
    expect(response.status).toBe(404)
  })
})

describe('parseGitHubRemoteUrl', () => {
  it('parses an SSH remote URL', () => {
    expect(parseGitHubRemoteUrl('git@github.com:JLPARTIN/CodeMind.git')).toBe('JLPARTIN/CodeMind')
  })

  it('parses an HTTPS remote URL', () => {
    expect(parseGitHubRemoteUrl('https://github.com/JLPARTIN/CodeMind.git')).toBe(
      'JLPARTIN/CodeMind',
    )
  })

  it('parses an HTTPS remote URL without the .git suffix', () => {
    expect(parseGitHubRemoteUrl('https://github.com/JLPARTIN/CodeMind')).toBe('JLPARTIN/CodeMind')
  })

  it('returns undefined for a non-GitHub remote', () => {
    expect(parseGitHubRemoteUrl('https://gitlab.com/owner/repo.git')).toBeUndefined()
  })
})

describe('POST /api/repository/push', () => {
  let remoteDir: string

  beforeEach(async () => {
    remoteDir = mkdtempSync(join(tmpdir(), 'codemind-repository-push-remote-'))
    await runGitCommand(['init', '--bare'], remoteDir)
  })

  afterEach(() => {
    rmSync(remoteDir, { recursive: true, force: true })
  })

  it('requires authentication', async () => {
    const server = await launch()
    const response = await fetch(`${server.url}/api/repository/push`, { method: 'POST' })
    expect(response.status).toBe(401)
  })

  it('requires confirm: true', async () => {
    const server = await launch()
    const response = await fetch(`${server.url}/api/repository/push`, {
      method: 'POST',
      headers: { ...auth(), 'content-type': 'application/json' },
      body: JSON.stringify({}),
    })
    expect(response.status).toBe(400)
  })

  it('blocks pushing directly from a protected branch like main', async () => {
    await runGitCommand(['checkout', '-b', 'main'], cwd)
    writeFileSync(join(cwd, 'a.ts'), 'const a = 1\n')
    await runGitCommand(['add', 'a.ts'], cwd)
    await runGitCommand(['commit', '-m', 'init'], cwd)
    await runGitCommand(['remote', 'add', 'origin', remoteDir], cwd)

    const server = await launch()
    const response = await fetch(`${server.url}/api/repository/push`, {
      method: 'POST',
      headers: { ...auth(), 'content-type': 'application/json' },
      body: JSON.stringify({ confirm: true }),
    })
    expect(response.status).toBe(403)
  })

  it('pushes a feature branch to a real remote and sets upstream', async () => {
    await runGitCommand(['checkout', '-b', 'main'], cwd)
    writeFileSync(join(cwd, 'a.ts'), 'const a = 1\n')
    await runGitCommand(['add', 'a.ts'], cwd)
    await runGitCommand(['commit', '-m', 'init'], cwd)
    await runGitCommand(['remote', 'add', 'origin', remoteDir], cwd)
    await runGitCommand(['checkout', '-b', 'feature/push-test'], cwd)

    const server = await launch()
    const response = await fetch(`${server.url}/api/repository/push`, {
      method: 'POST',
      headers: { ...auth(), 'content-type': 'application/json' },
      body: JSON.stringify({ confirm: true, setUpstream: true }),
    })
    expect(response.status).toBe(200)

    const remoteBranches = await runGitCommand(['branch', '--list'], remoteDir)
    expect(remoteBranches.stdout).toContain('feature/push-test')
  })

  it('never exposes a force-push option -- only remote/branch/setUpstream are accepted', async () => {
    await runGitCommand(['checkout', '-b', 'main'], cwd)
    writeFileSync(join(cwd, 'a.ts'), 'const a = 1\n')
    await runGitCommand(['add', 'a.ts'], cwd)
    await runGitCommand(['commit', '-m', 'init'], cwd)
    await runGitCommand(['remote', 'add', 'origin', remoteDir], cwd)
    await runGitCommand(['checkout', '-b', 'feature/no-force'], cwd)

    const server = await launch()
    // A client-supplied "force" field is simply ignored -- the route never
    // forwards arbitrary flags to `git push`, only remote/branch/setUpstream.
    const response = await fetch(`${server.url}/api/repository/push`, {
      method: 'POST',
      headers: { ...auth(), 'content-type': 'application/json' },
      body: JSON.stringify({ confirm: true, force: true }),
    })
    expect(response.status).toBe(200)

    const remoteBranches = await runGitCommand(['branch', '--list'], remoteDir)
    expect(remoteBranches.stdout).toContain('feature/no-force')
  })
})

describe('POST /api/repository/pull-request', () => {
  it('requires authentication', async () => {
    const server = await launch()
    const response = await fetch(`${server.url}/api/repository/pull-request`, { method: 'POST' })
    expect(response.status).toBe(401)
  })

  it('returns a clear error when no GitHub client/token is configured', async () => {
    const server = await launch()
    const response = await fetch(`${server.url}/api/repository/pull-request`, {
      method: 'POST',
      headers: { ...auth(), 'content-type': 'application/json' },
      body: JSON.stringify({
        confirm: true,
        baseBranch: 'main',
        headBranch: 'feature/x',
        title: 'Add feature',
      }),
    })
    expect(response.status).toBe(400)
    const body = (await response.json()) as { error: string }
    expect(body.error).toContain('GITHUB_TOKEN')
  })

  it('requires confirm: true', async () => {
    const fakeClient = new FakeGitHubPrCreationClient()
    started = await startChatServer({
      apiKey: API_KEY,
      host: '127.0.0.1',
      port: 0,
      env: {},
      cwd,
      rateLimiter: new UnlimitedRateLimiter(),
      githubPrCreationClient: fakeClient,
    })

    const response = await fetch(`${started.url}/api/repository/pull-request`, {
      method: 'POST',
      headers: { ...auth(), 'content-type': 'application/json' },
      body: JSON.stringify({ baseBranch: 'main', headBranch: 'feature/x', title: 'x' }),
    })
    expect(response.status).toBe(400)
    expect(fakeClient.operations).toEqual([])
  })

  it('creates a real draft PR via the injected client, auto-deriving changed files from git status', async () => {
    writeFileSync(join(cwd, 'a.ts'), 'const a = 1\n')
    await runGitCommand(['add', 'a.ts'], cwd)
    await runGitCommand(['commit', '-m', 'init'], cwd)
    writeFileSync(join(cwd, 'a.ts'), 'const a = 2\n')

    const fakeClient = new FakeGitHubPrCreationClient()
    started = await startChatServer({
      apiKey: API_KEY,
      host: '127.0.0.1',
      port: 0,
      // GITHUB_TOKEN drives repositoryContext.policy.allowGitHubWrites in
      // codemind-chat-server.ts; the actual REST calls go through the
      // injected fakeClient below, not a real GitHub client.
      env: { GITHUB_TOKEN: 'fake-value-for-policy' },
      cwd,
      rateLimiter: new UnlimitedRateLimiter(),
      githubPrCreationClient: fakeClient,
    })

    const response = await fetch(`${started.url}/api/repository/pull-request`, {
      method: 'POST',
      headers: { ...auth(), 'content-type': 'application/json' },
      body: JSON.stringify({
        confirm: true,
        repository: 'acme/widgets',
        baseBranch: 'main',
        headBranch: 'feature/from-repo-view',
        title: 'Update a.ts',
        body: 'via Repository tab',
      }),
    })
    expect(response.status).toBe(200)
    const result = (await response.json()) as { outcome: string; pullRequestUrl: string | null }
    expect(result.outcome).toBe('CREATED')
    expect(result.pullRequestUrl).toContain('acme/widgets')

    const commitOp = fakeClient.operations.find((op) => op.type === 'commitFiles')
    expect(commitOp?.type).toBe('commitFiles')
    if (commitOp?.type === 'commitFiles') {
      expect(commitOp.files).toEqual([{ path: 'a.ts', content: 'const a = 2\n' }])
    }
  })

  it('never auto-includes CodeMind checkpoint state (.codemind/) when deriving PR files from git status', async () => {
    const fakeClient = new FakeGitHubPrCreationClient()
    started = await startChatServer({
      apiKey: API_KEY,
      host: '127.0.0.1',
      port: 0,
      env: { GITHUB_TOKEN: 'fake-value-for-policy' },
      cwd,
      rateLimiter: new UnlimitedRateLimiter(),
      githubPrCreationClient: fakeClient,
    })

    // A prior write creates .codemind/checkpoints/... as untracked content.
    const putResponse = await fetch(`${started.url}/api/repository/file`, {
      method: 'PUT',
      headers: { ...auth(), 'content-type': 'application/json' },
      body: JSON.stringify({ path: 'a.ts', content: 'const a = 1\n' }),
    })
    expect(putResponse.status).toBe(200)

    const response = await fetch(`${started.url}/api/repository/pull-request`, {
      method: 'POST',
      headers: { ...auth(), 'content-type': 'application/json' },
      body: JSON.stringify({
        confirm: true,
        repository: 'acme/widgets',
        baseBranch: 'main',
        headBranch: 'feature/no-checkpoint-leak',
        title: 'Add a.ts',
      }),
    })
    expect(response.status).toBe(200)

    const commitOp = fakeClient.operations.find((op) => op.type === 'commitFiles')
    expect(commitOp?.type).toBe('commitFiles')
    if (commitOp?.type === 'commitFiles') {
      expect(commitOp.files.some((file) => file.path.startsWith('.codemind'))).toBe(false)
    }
  })

  it('blocks creating a PR whose head branch is main', async () => {
    const fakeClient = new FakeGitHubPrCreationClient()
    started = await startChatServer({
      apiKey: API_KEY,
      host: '127.0.0.1',
      port: 0,
      env: { GITHUB_TOKEN: 'fake-value-for-policy' },
      cwd,
      rateLimiter: new UnlimitedRateLimiter(),
      githubPrCreationClient: fakeClient,
    })
    writeFileSync(join(cwd, 'a.ts'), 'const a = 1\n')

    const response = await fetch(`${started.url}/api/repository/pull-request`, {
      method: 'POST',
      headers: { ...auth(), 'content-type': 'application/json' },
      body: JSON.stringify({
        confirm: true,
        repository: 'acme/widgets',
        baseBranch: 'main',
        headBranch: 'main',
        title: 'x',
      }),
    })
    expect(response.status).toBe(403)
    expect(fakeClient.operations).toEqual([])
  })
})

describe('malformed request bodies', () => {
  it('PUT /api/repository/file rejects invalid JSON', async () => {
    const server = await launch()
    const response = await fetch(`${server.url}/api/repository/file`, {
      method: 'PUT',
      headers: { ...auth(), 'content-type': 'application/json' },
      body: 'not json',
    })
    expect(response.status).toBe(400)
  })

  it('POST /api/repository/branches rejects invalid JSON', async () => {
    const server = await launch()
    const response = await fetch(`${server.url}/api/repository/branches`, {
      method: 'POST',
      headers: { ...auth(), 'content-type': 'application/json' },
      body: 'not json',
    })
    expect(response.status).toBe(400)
  })

  it('POST /api/repository/commit rejects invalid JSON', async () => {
    const server = await launch()
    const response = await fetch(`${server.url}/api/repository/commit`, {
      method: 'POST',
      headers: { ...auth(), 'content-type': 'application/json' },
      body: 'not json',
    })
    expect(response.status).toBe(400)
  })

  it('POST /api/repository/push rejects invalid JSON', async () => {
    const server = await launch()
    const response = await fetch(`${server.url}/api/repository/push`, {
      method: 'POST',
      headers: { ...auth(), 'content-type': 'application/json' },
      body: 'not json',
    })
    expect(response.status).toBe(400)
  })

  it('POST /api/repository/pull-request rejects invalid JSON', async () => {
    const server = await launch()
    const response = await fetch(`${server.url}/api/repository/pull-request`, {
      method: 'POST',
      headers: { ...auth(), 'content-type': 'application/json' },
      body: 'not json',
    })
    expect(response.status).toBe(400)
  })
})

describe('additional validation and error paths', () => {
  it('GET /api/repository/tree rejects a dir that resolves to a file, not a directory', async () => {
    writeFileSync(join(cwd, 'a.ts'), 'x')
    const server = await launch()
    const response = await fetch(`${server.url}/api/repository/tree?dir=a.ts`, { headers: auth() })
    expect(response.status).toBe(400)
  })

  it('GET /api/repository/file rejects a path outside the workspace', async () => {
    const server = await launch()
    const response = await fetch(
      `${server.url}/api/repository/file?path=${encodeURIComponent('../../etc/passwd')}`,
      { headers: auth() },
    )
    expect(response.status).toBe(400)
  })

  it('GET /api/repository/diff rejects a path outside the workspace', async () => {
    const server = await launch()
    const response = await fetch(
      `${server.url}/api/repository/diff?path=${encodeURIComponent('../../etc/passwd')}`,
      { headers: auth() },
    )
    expect(response.status).toBe(400)
  })

  it('PUT /api/repository/file rejects writing to a path that is a directory', async () => {
    mkdirSync(join(cwd, 'src'))
    const server = await launch()
    const response = await fetch(`${server.url}/api/repository/file`, {
      method: 'PUT',
      headers: { ...auth(), 'content-type': 'application/json' },
      body: JSON.stringify({ path: 'src', content: 'x' }),
    })
    expect(response.status).toBe(400)
  })

  it('POST /api/repository/branches requires name', async () => {
    const server = await launch()
    const response = await fetch(`${server.url}/api/repository/branches`, {
      method: 'POST',
      headers: { ...auth(), 'content-type': 'application/json' },
      body: JSON.stringify({}),
    })
    expect(response.status).toBe(400)
  })

  it('POST /api/repository/branches returns 400 when the branch already exists', async () => {
    writeFileSync(join(cwd, 'a.ts'), 'x')
    await runGitCommand(['add', 'a.ts'], cwd)
    await runGitCommand(['commit', '-m', 'init'], cwd)
    await runGitCommand(['branch', 'existing'], cwd)

    const server = await launch()
    const response = await fetch(`${server.url}/api/repository/branches`, {
      method: 'POST',
      headers: { ...auth(), 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'existing' }),
    })
    expect(response.status).toBe(400)
  })

  it('POST /api/repository/commit requires message', async () => {
    const server = await launch()
    const response = await fetch(`${server.url}/api/repository/commit`, {
      method: 'POST',
      headers: { ...auth(), 'content-type': 'application/json' },
      body: JSON.stringify({}),
    })
    expect(response.status).toBe(400)
  })

  it('POST /api/repository/push returns 400 for a detached HEAD', async () => {
    writeFileSync(join(cwd, 'a.ts'), 'x')
    await runGitCommand(['add', 'a.ts'], cwd)
    await runGitCommand(['commit', '-m', 'init'], cwd)
    const rev = await runGitCommand(['rev-parse', 'HEAD'], cwd)
    await runGitCommand(['checkout', rev.stdout.trim()], cwd)

    const server = await launch()
    const response = await fetch(`${server.url}/api/repository/push`, {
      method: 'POST',
      headers: { ...auth(), 'content-type': 'application/json' },
      body: JSON.stringify({ confirm: true }),
    })
    expect(response.status).toBe(400)
  })

  it('POST /api/repository/push blocks an explicit push to a protected branch name even from a different current branch', async () => {
    await runGitCommand(['checkout', '-b', 'main'], cwd)
    writeFileSync(join(cwd, 'a.ts'), 'x')
    await runGitCommand(['add', 'a.ts'], cwd)
    await runGitCommand(['commit', '-m', 'init'], cwd)
    await runGitCommand(['checkout', '-b', 'feature/x'], cwd)

    const server = await launch()
    const response = await fetch(`${server.url}/api/repository/push`, {
      method: 'POST',
      headers: { ...auth(), 'content-type': 'application/json' },
      body: JSON.stringify({ confirm: true, branch: 'main' }),
    })
    expect(response.status).toBe(403)
  })

  it('POST /api/repository/push returns 502 when the remote push itself fails', async () => {
    await runGitCommand(['checkout', '-b', 'main'], cwd)
    writeFileSync(join(cwd, 'a.ts'), 'x')
    await runGitCommand(['add', 'a.ts'], cwd)
    await runGitCommand(['commit', '-m', 'init'], cwd)
    await runGitCommand(['checkout', '-b', 'feature/no-remote'], cwd)
    // No "origin" remote configured -- the push itself will fail.

    const server = await launch()
    const response = await fetch(`${server.url}/api/repository/push`, {
      method: 'POST',
      headers: { ...auth(), 'content-type': 'application/json' },
      body: JSON.stringify({ confirm: true }),
    })
    expect(response.status).toBe(502)
  })

  it('POST /api/repository/pull-request requires baseBranch, headBranch, and title', async () => {
    const fakeClient = new FakeGitHubPrCreationClient()
    started = await startChatServer({
      apiKey: API_KEY,
      host: '127.0.0.1',
      port: 0,
      env: { GITHUB_TOKEN: 'fake-value-for-policy' },
      cwd,
      rateLimiter: new UnlimitedRateLimiter(),
      githubPrCreationClient: fakeClient,
    })

    const missingBase = await fetch(`${started.url}/api/repository/pull-request`, {
      method: 'POST',
      headers: { ...auth(), 'content-type': 'application/json' },
      body: JSON.stringify({ confirm: true, headBranch: 'x', title: 'x' }),
    })
    expect(missingBase.status).toBe(400)

    const missingHead = await fetch(`${started.url}/api/repository/pull-request`, {
      method: 'POST',
      headers: { ...auth(), 'content-type': 'application/json' },
      body: JSON.stringify({ confirm: true, baseBranch: 'main', title: 'x' }),
    })
    expect(missingHead.status).toBe(400)

    const missingTitle = await fetch(`${started.url}/api/repository/pull-request`, {
      method: 'POST',
      headers: { ...auth(), 'content-type': 'application/json' },
      body: JSON.stringify({ confirm: true, baseBranch: 'main', headBranch: 'x' }),
    })
    expect(missingTitle.status).toBe(400)

    expect(fakeClient.operations).toEqual([])
  })

  it('POST /api/repository/pull-request returns 400 when no repository can be determined', async () => {
    const fakeClient = new FakeGitHubPrCreationClient()
    started = await startChatServer({
      apiKey: API_KEY,
      host: '127.0.0.1',
      port: 0,
      env: { GITHUB_TOKEN: 'fake-value-for-policy' },
      cwd,
      rateLimiter: new UnlimitedRateLimiter(),
      githubPrCreationClient: fakeClient,
    })
    // No "origin" remote configured, and no explicit "repository" in the body.

    const response = await fetch(`${started.url}/api/repository/pull-request`, {
      method: 'POST',
      headers: { ...auth(), 'content-type': 'application/json' },
      body: JSON.stringify({ confirm: true, baseBranch: 'main', headBranch: 'x', title: 'x' }),
    })
    expect(response.status).toBe(400)
    const body = (await response.json()) as { error: string }
    expect(body.error).toContain('repository')
  })

  it('POST /api/repository/pull-request returns 400 when there are no changed files to include', async () => {
    const fakeClient = new FakeGitHubPrCreationClient()
    started = await startChatServer({
      apiKey: API_KEY,
      host: '127.0.0.1',
      port: 0,
      env: { GITHUB_TOKEN: 'fake-value-for-policy' },
      cwd,
      rateLimiter: new UnlimitedRateLimiter(),
      githubPrCreationClient: fakeClient,
    })

    const response = await fetch(`${started.url}/api/repository/pull-request`, {
      method: 'POST',
      headers: { ...auth(), 'content-type': 'application/json' },
      body: JSON.stringify({
        confirm: true,
        repository: 'acme/widgets',
        baseBranch: 'main',
        headBranch: 'feature/empty',
        title: 'Nothing to see here',
      }),
    })
    expect(response.status).toBe(400)
  })

  it('POST /api/repository/pull-request accepts explicit files without touching git status', async () => {
    const fakeClient = new FakeGitHubPrCreationClient()
    started = await startChatServer({
      apiKey: API_KEY,
      host: '127.0.0.1',
      port: 0,
      env: { GITHUB_TOKEN: 'fake-value-for-policy' },
      cwd,
      rateLimiter: new UnlimitedRateLimiter(),
      githubPrCreationClient: fakeClient,
    })

    const response = await fetch(`${started.url}/api/repository/pull-request`, {
      method: 'POST',
      headers: { ...auth(), 'content-type': 'application/json' },
      body: JSON.stringify({
        confirm: true,
        repository: 'acme/widgets',
        baseBranch: 'main',
        headBranch: 'feature/explicit-files',
        title: 'Explicit files',
        files: [{ path: 'explicit.ts', content: 'export const x = 1\n' }, { path: 'bad-entry' }],
      }),
    })
    expect(response.status).toBe(200)
    const commitOp = fakeClient.operations.find((op) => op.type === 'commitFiles')
    expect(commitOp?.type).toBe('commitFiles')
    if (commitOp?.type === 'commitFiles') {
      expect(commitOp.files).toEqual([{ path: 'explicit.ts', content: 'export const x = 1\n' }])
    }
  })
})
