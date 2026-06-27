import { describe, expect, it, vi, afterEach } from 'vitest'

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

  it('sends POST requests with correct headers and body', async () => {
    mockFetch(201, { id: 42, html_url: 'https://github.com/owner/repo/pull/42' })

    const client = new DefaultGitHubHttpClient({ token: 'ghp_posttoken' })
    const result = await client.post('/repos/owner/repo/pulls', {
      title: 'My PR',
      head: 'feature',
      base: 'main',
    })

    expect(result.status).toBe(201)
    expect(result.body).toEqual({ id: 42, html_url: 'https://github.com/owner/repo/pull/42' })

    const fetchCall = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]!
    expect(fetchCall[0]).toBe('https://api.github.com/repos/owner/repo/pulls')
    expect(fetchCall[1]).toEqual({
      method: 'POST',
      headers: {
        Accept: 'application/vnd.github.v3+json',
        Authorization: 'Bearer ghp_posttoken',
        'User-Agent': 'CodeMind/0.1.0',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ title: 'My PR', head: 'feature', base: 'main' }),
    })
  })

  it('post uses custom baseUrl', async () => {
    mockFetch(201, {})

    const client = new DefaultGitHubHttpClient({
      token: 'ghp_test',
      baseUrl: 'https://ghe.example.com/api/v3',
    })
    await client.post('/repos/owner/repo/issues/1/comments', { body: 'hello' })

    const fetchCall = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]!
    expect(fetchCall[0]).toBe('https://ghe.example.com/api/v3/repos/owner/repo/issues/1/comments')
  })

  it('post returns error status codes without throwing', async () => {
    mockFetch(422, { message: 'Validation Failed' })

    const client = new DefaultGitHubHttpClient({ token: 'ghp_test' })
    const result = await client.post('/repos/owner/repo/pulls', { title: '' })

    expect(result.status).toBe(422)
    expect(result.body).toEqual({ message: 'Validation Failed' })
  })
})
