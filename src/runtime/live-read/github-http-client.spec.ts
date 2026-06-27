import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

import { DefaultGitHubHttpClient, type GitHubHttpClient } from './github-http-client.js'

describe('DefaultGitHubHttpClient', () => {
  const originalFetch = globalThis.fetch

  afterEach(() => {
    globalThis.fetch = originalFetch
    vi.restoreAllMocks()
  })

  function mockFetch(status: number, body: unknown): void {
    globalThis.fetch = vi.fn().mockResolvedValue({
      status,
      json: async () => body,
    })
  }

  it('implements GitHubHttpClient interface', () => {
    const client: GitHubHttpClient = new DefaultGitHubHttpClient({ token: 'ghp_test' })
    expect(client.get).toBeDefined()
  })

  it('sends GET requests with correct headers', async () => {
    mockFetch(200, { id: 1 })

    const client = new DefaultGitHubHttpClient({ token: 'ghp_testtoken123' })
    const result = await client.get('/repos/owner/repo/pulls/1')

    expect(result.status).toBe(200)
    expect(result.body).toEqual({ id: 1 })

    const fetchCall = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]!
    expect(fetchCall[0]).toBe('https://api.github.com/repos/owner/repo/pulls/1')
    expect(fetchCall[1]).toEqual({
      method: 'GET',
      headers: {
        Accept: 'application/vnd.github.v3+json',
        Authorization: 'Bearer ghp_testtoken123',
        'User-Agent': 'CodeMind/0.1.0',
      },
    })
  })

  it('uses custom baseUrl when provided', async () => {
    mockFetch(200, {})

    const client = new DefaultGitHubHttpClient({
      token: 'ghp_test',
      baseUrl: 'https://github.example.com/api/v3',
    })
    await client.get('/repos/owner/repo')

    const fetchCall = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]!
    expect(fetchCall[0]).toBe('https://github.example.com/api/v3/repos/owner/repo')
  })

  it('returns error status codes without throwing', async () => {
    mockFetch(404, { message: 'Not Found' })

    const client = new DefaultGitHubHttpClient({ token: 'ghp_test' })
    const result = await client.get('/repos/owner/nonexistent')

    expect(result.status).toBe(404)
    expect(result.body).toEqual({ message: 'Not Found' })
  })

  it('returns 403 for rate-limited responses', async () => {
    mockFetch(403, { message: 'API rate limit exceeded' })

    const client = new DefaultGitHubHttpClient({ token: 'ghp_test' })
    const result = await client.get('/repos/owner/repo')

    expect(result.status).toBe(403)
  })

  it('defaults baseUrl to GitHub API', async () => {
    mockFetch(200, {})

    const client = new DefaultGitHubHttpClient({ token: 'ghp_test' })
    await client.get('/user')

    const fetchCall = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]!
    expect(fetchCall[0]).toBe('https://api.github.com/user')
  })
})
