import { generateKeyPairSync } from 'node:crypto'
import { describe, expect, it } from 'vitest'

import { createGitHubTokenResolver } from './github-token-resolver.js'
import { GitHubAppInstallationNotFoundError } from './github-app-token-provider.js'
import type { GitHubAppHttpResponse, GitHubAppTransport } from './github-app-token-provider.js'

function testPrivateKeyPem(): string {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
  return privateKey.export({ type: 'pkcs1', format: 'pem' }).toString()
}

function jsonResponse(status: number, body: unknown): GitHubAppHttpResponse {
  return { status, json: async () => body }
}

describe('createGitHubTokenResolver', () => {
  it('falls back to the GITHUB_TOKEN PAT when no GitHub App is configured', async () => {
    const resolver = createGitHubTokenResolver({ env: { GITHUB_TOKEN: 'ghp_pat_value' } })
    expect(await resolver('acme/widgets')).toBe('ghp_pat_value')
    expect(await resolver()).toBe('ghp_pat_value')
  })

  it('returns undefined when neither an App nor a PAT is configured', async () => {
    const resolver = createGitHubTokenResolver({ env: {} })
    expect(await resolver('acme/widgets')).toBeUndefined()
  })

  it('mints an App installation token for a specific repository when an App is configured', async () => {
    const transport: GitHubAppTransport = async (url) => {
      if (url.endsWith('/installation')) return jsonResponse(200, { id: 42 })
      return jsonResponse(201, {
        token: 'ghs_app_token',
        expires_at: new Date(Date.now() + 3600_000).toISOString(),
      })
    }
    const resolver = createGitHubTokenResolver({
      env: {
        GITHUB_APP_ID: '1',
        GITHUB_APP_PRIVATE_KEY: testPrivateKeyPem(),
        GITHUB_TOKEN: 'ghp_should_not_be_used',
      },
      appProviderOptions: { transport },
    })
    expect(await resolver('acme/widgets')).toBe('ghs_app_token')
  })

  it('does not fall back to the PAT when the App has no installation for the repository', async () => {
    const transport: GitHubAppTransport = async () => jsonResponse(404, {})
    const resolver = createGitHubTokenResolver({
      env: {
        GITHUB_APP_ID: '1',
        GITHUB_APP_PRIVATE_KEY: testPrivateKeyPem(),
        GITHUB_TOKEN: 'ghp_should_not_be_used',
      },
      appProviderOptions: { transport },
    })
    await expect(resolver('acme/widgets')).rejects.toThrow(GitHubAppInstallationNotFoundError)
  })

  it('falls back to the PAT when an App is configured but no repository is specified', async () => {
    const resolver = createGitHubTokenResolver({
      env: {
        GITHUB_APP_ID: '1',
        GITHUB_APP_PRIVATE_KEY: testPrivateKeyPem(),
        GITHUB_TOKEN: 'ghp_generic',
      },
    })
    expect(await resolver()).toBe('ghp_generic')
  })

  it('reuses the same GitHubAppTokenProvider (and its caches) across repeated calls', async () => {
    let installationLookups = 0
    const transport: GitHubAppTransport = async (url) => {
      if (url.endsWith('/installation')) {
        installationLookups += 1
        return jsonResponse(200, { id: 42 })
      }
      return jsonResponse(201, {
        token: 'ghs_app_token',
        expires_at: new Date(Date.now() + 3600_000).toISOString(),
      })
    }
    const resolver = createGitHubTokenResolver({
      env: { GITHUB_APP_ID: '1', GITHUB_APP_PRIVATE_KEY: testPrivateKeyPem() },
      appProviderOptions: { transport },
    })
    await resolver('acme/widgets')
    await resolver('acme/widgets')
    expect(installationLookups).toBe(1)
  })
})
