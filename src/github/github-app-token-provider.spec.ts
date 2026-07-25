import { generateKeyPairSync } from 'node:crypto'
import { describe, expect, it } from 'vitest'

import type { GitHubAppConfig } from './github-app-auth.js'
import {
  GitHubAppInstallationNotFoundError,
  GitHubAppTokenProvider,
  GitHubAppTokenRequestError,
  type GitHubAppHttpResponse,
  type GitHubAppTransport,
} from './github-app-token-provider.js'

function fakeConfig(): GitHubAppConfig {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
  return {
    appId: '123',
    privateKeyPem: privateKey.export({ type: 'pkcs1', format: 'pem' }).toString(),
  }
}

function jsonResponse(status: number, body: unknown): GitHubAppHttpResponse {
  return { status, json: async () => body }
}

describe('GitHubAppTokenProvider', () => {
  it('resolves the installation id, then mints and returns an installation access token', async () => {
    const calls: string[] = []
    const transport: GitHubAppTransport = async (url) => {
      calls.push(url)
      if (url.endsWith('/repos/acme/widgets/installation')) {
        return jsonResponse(200, { id: 555 })
      }
      if (url.endsWith('/app/installations/555/access_tokens')) {
        return jsonResponse(201, {
          token: 'ghs_installation_token',
          expires_at: new Date(Date.now() + 3600_000).toISOString(),
        })
      }
      throw new Error(`unexpected url ${url}`)
    }

    const provider = new GitHubAppTokenProvider(fakeConfig(), { transport })
    const token = await provider.getTokenForRepository('acme/widgets')
    expect(token).toBe('ghs_installation_token')
    expect(calls).toEqual([
      'https://api.github.com/repos/acme/widgets/installation',
      'https://api.github.com/app/installations/555/access_tokens',
    ])
  })

  it('caches the installation id and the token across repeated calls', async () => {
    let installationLookups = 0
    let tokenMints = 0
    const transport: GitHubAppTransport = async (url) => {
      if (url.endsWith('/installation')) {
        installationLookups += 1
        return jsonResponse(200, { id: 555 })
      }
      tokenMints += 1
      return jsonResponse(201, {
        token: `ghs_token_${tokenMints}`,
        expires_at: new Date(Date.now() + 3600_000).toISOString(),
      })
    }

    const provider = new GitHubAppTokenProvider(fakeConfig(), { transport })
    const first = await provider.getTokenForRepository('acme/widgets')
    const second = await provider.getTokenForRepository('acme/widgets')
    expect(first).toBe(second)
    expect(installationLookups).toBe(1)
    expect(tokenMints).toBe(1)
  })

  it('mints a fresh token once the cached one is within the refresh margin of expiry', async () => {
    let now = new Date('2026-01-01T00:00:00Z')
    let tokenMints = 0
    const transport: GitHubAppTransport = async (url) => {
      if (url.endsWith('/installation')) return jsonResponse(200, { id: 555 })
      tokenMints += 1
      return jsonResponse(201, {
        token: `ghs_token_${tokenMints}`,
        expires_at: new Date(now.getTime() + 3600_000).toISOString(),
      })
    }

    const provider = new GitHubAppTokenProvider(fakeConfig(), { transport, now: () => now })
    const first = await provider.getTokenForRepository('acme/widgets')
    expect(first).toBe('ghs_token_1')

    // Advance to just inside the refresh margin of the cached token's expiry.
    now = new Date(now.getTime() + 3600_000 - 60_000)
    const second = await provider.getTokenForRepository('acme/widgets')
    expect(second).toBe('ghs_token_2')
    expect(tokenMints).toBe(2)
  })

  it('throws GitHubAppInstallationNotFoundError on a 404 (no installation covers the repo)', async () => {
    const transport: GitHubAppTransport = async () => jsonResponse(404, {})
    const provider = new GitHubAppTokenProvider(fakeConfig(), { transport })
    await expect(provider.getTokenForRepository('acme/widgets')).rejects.toThrow(
      GitHubAppInstallationNotFoundError,
    )
  })

  it('throws GitHubAppTokenRequestError on any other non-200 installation lookup status', async () => {
    const transport: GitHubAppTransport = async () => jsonResponse(500, {})
    const provider = new GitHubAppTokenProvider(fakeConfig(), { transport })
    await expect(provider.getTokenForRepository('acme/widgets')).rejects.toThrow(
      GitHubAppTokenRequestError,
    )
  })

  it('throws GitHubAppTokenRequestError when minting the token itself fails', async () => {
    const transport: GitHubAppTransport = async (url) => {
      if (url.endsWith('/installation')) return jsonResponse(200, { id: 555 })
      return jsonResponse(403, {})
    }
    const provider = new GitHubAppTokenProvider(fakeConfig(), { transport })
    await expect(provider.getTokenForRepository('acme/widgets')).rejects.toThrow(
      GitHubAppTokenRequestError,
    )
  })

  it('throws when the token response is missing token or expires_at', async () => {
    const transport: GitHubAppTransport = async (url) => {
      if (url.endsWith('/installation')) return jsonResponse(200, { id: 555 })
      return jsonResponse(201, { token: '' })
    }
    const provider = new GitHubAppTokenProvider(fakeConfig(), { transport })
    await expect(provider.getTokenForRepository('acme/widgets')).rejects.toThrow(
      GitHubAppTokenRequestError,
    )
  })

  it('rejects a malformed repository string', async () => {
    const provider = new GitHubAppTokenProvider(fakeConfig(), {
      transport: async () => jsonResponse(200, {}),
    })
    await expect(provider.getTokenForRepository('not-owner-slash-repo')).rejects.toThrow(
      'Invalid repository format',
    )
  })

  it('resolves installations independently for different repositories', async () => {
    const transport: GitHubAppTransport = async (url) => {
      if (url.endsWith('/repos/acme/widgets/installation')) return jsonResponse(200, { id: 111 })
      if (url.endsWith('/repos/acme/gadgets/installation')) return jsonResponse(200, { id: 222 })
      if (url.endsWith('/app/installations/111/access_tokens')) {
        return jsonResponse(201, {
          token: 'token-111',
          expires_at: new Date(Date.now() + 3600_000).toISOString(),
        })
      }
      if (url.endsWith('/app/installations/222/access_tokens')) {
        return jsonResponse(201, {
          token: 'token-222',
          expires_at: new Date(Date.now() + 3600_000).toISOString(),
        })
      }
      throw new Error(`unexpected url ${url}`)
    }
    const provider = new GitHubAppTokenProvider(fakeConfig(), { transport })
    expect(await provider.getTokenForRepository('acme/widgets')).toBe('token-111')
    expect(await provider.getTokenForRepository('acme/gadgets')).toBe('token-222')
  })
})
