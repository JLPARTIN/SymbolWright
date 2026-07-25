import type { GitHubAppConfig } from './github-app-auth.js'
import { signGitHubAppJwt } from './github-app-auth.js'

export class GitHubAppInstallationNotFoundError extends Error {}
export class GitHubAppTokenRequestError extends Error {}

export interface GitHubAppHttpResponse {
  readonly status: number
  json(): Promise<unknown>
}

/** Minimal fetch-shaped transport so tests never hit the real GitHub API. */
export type GitHubAppTransport = (
  url: string,
  init: { readonly method: string; readonly headers: Record<string, string> },
) => Promise<GitHubAppHttpResponse>

const defaultTransport: GitHubAppTransport = (url, init) => fetch(url, init)

export interface GitHubAppTokenProviderOptions {
  readonly transport?: GitHubAppTransport
  readonly now?: () => Date
  readonly apiBase?: string
}

interface CachedToken {
  readonly token: string
  readonly expiresAtMs: number
}

/** Refresh this many seconds before GitHub's stated expiry, to absorb request latency and clock skew. */
const TOKEN_REFRESH_MARGIN_SECONDS = 120

function parseOwnerRepo(repository: string): { readonly owner: string; readonly repo: string } {
  const parts = repository.split('/')
  if (parts.length !== 2 || parts[0]!.length === 0 || parts[1]!.length === 0) {
    throw new Error(`Invalid repository format: "${repository}". Expected "owner/repo".`)
  }
  return { owner: parts[0]!, repo: parts[1]! }
}

/**
 * Mints short-lived, per-repository GitHub App installation access tokens — Layer C's preferred
 * architecture (`docs/security/DELEGATED_AGENT_ACCESS.md`, Section 6). A token minted here is
 * scoped to exactly the installation covering the requested repository (GitHub itself enforces
 * that scope — this is real installation-level isolation, not something SymbolWright emulates),
 * and is never returned to an agent or written to a tool result: only `resolveGitHubToken()`
 * (`github-token-resolver.ts`) calls this, server-side, immediately before constructing an
 * HTTP client for one GitHub write.
 */
export class GitHubAppTokenProvider {
  private readonly transport: GitHubAppTransport
  private readonly now: () => Date
  private readonly apiBase: string
  private readonly installationIdCache = new Map<string, string>()
  private readonly tokenCache = new Map<string, CachedToken>()

  public constructor(
    private readonly config: GitHubAppConfig,
    options: GitHubAppTokenProviderOptions = {},
  ) {
    this.transport = options.transport ?? defaultTransport
    this.now = options.now ?? (() => new Date())
    this.apiBase = options.apiBase ?? 'https://api.github.com'
  }

  /** Returns a valid installation access token scoped to `repository` ("owner/repo"), minting or
   * reusing a cached one as needed. Throws `GitHubAppInstallationNotFoundError` if this App has no
   * installation covering the repository — callers must not fall back to a broader credential in
   * that case; that would defeat installation-level scoping. */
  public async getTokenForRepository(repository: string): Promise<string> {
    const installationId = await this.resolveInstallationId(repository)
    const cached = this.tokenCache.get(installationId)
    const nowMs = this.now().getTime()
    if (cached !== undefined && cached.expiresAtMs - TOKEN_REFRESH_MARGIN_SECONDS * 1000 > nowMs) {
      return cached.token
    }

    const jwt = signGitHubAppJwt(this.config, this.now)
    const response = await this.transport(
      `${this.apiBase}/app/installations/${installationId}/access_tokens`,
      { method: 'POST', headers: this.jwtHeaders(jwt) },
    )
    if (response.status !== 201) {
      throw new GitHubAppTokenRequestError(
        `Failed to mint an installation access token for installation ${installationId}: status ${response.status}`,
      )
    }
    const body = (await response.json()) as Record<string, unknown>
    const token = String(body['token'] ?? '')
    const expiresAt = String(body['expires_at'] ?? '')
    if (token.length === 0 || expiresAt.length === 0) {
      throw new GitHubAppTokenRequestError(
        'GitHub App installation-token response was missing "token" or "expires_at".',
      )
    }
    const expiresAtMs = new Date(expiresAt).getTime()
    this.tokenCache.set(installationId, { token, expiresAtMs })
    return token
  }

  private async resolveInstallationId(repository: string): Promise<string> {
    const cached = this.installationIdCache.get(repository)
    if (cached !== undefined) return cached

    const { owner, repo } = parseOwnerRepo(repository)
    const jwt = signGitHubAppJwt(this.config, this.now)
    const response = await this.transport(`${this.apiBase}/repos/${owner}/${repo}/installation`, {
      method: 'GET',
      headers: this.jwtHeaders(jwt),
    })
    if (response.status === 404) {
      throw new GitHubAppInstallationNotFoundError(
        `No GitHub App installation covers "${repository}". Install the App on this repository (or its organization) before granting agent access to it.`,
      )
    }
    if (response.status !== 200) {
      throw new GitHubAppTokenRequestError(
        `Failed to resolve the GitHub App installation for "${repository}": status ${response.status}`,
      )
    }
    const body = (await response.json()) as Record<string, unknown>
    const installationId = String(body['id'] ?? '')
    if (installationId.length === 0) {
      throw new GitHubAppTokenRequestError(
        `GitHub App installation lookup for "${repository}" did not return an "id".`,
      )
    }
    this.installationIdCache.set(repository, installationId)
    return installationId
  }

  private jwtHeaders(jwt: string): Record<string, string> {
    return {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${jwt}`,
      'User-Agent': 'SymbolWright/0.2.0',
      'X-GitHub-Api-Version': '2022-11-28',
    }
  }
}
