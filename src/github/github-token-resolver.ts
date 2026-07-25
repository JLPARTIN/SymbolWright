import { loadGitHubAppConfigFromEnv } from './github-app-auth.js'
import {
  GitHubAppTokenProvider,
  type GitHubAppTokenProviderOptions,
} from './github-app-token-provider.js'

/** Resolves the GitHub credential to use for one write, given an optional target repository.
 * Never returns a GitHub App JWT (App-authentication) token — only a short-lived installation
 * access token, or the PAT fallback. */
export type GitHubTokenResolver = (repository?: string) => Promise<string | undefined>

export interface GitHubTokenResolverOptions {
  readonly env: NodeJS.ProcessEnv
  readonly appProviderOptions?: GitHubAppTokenProviderOptions
}

/**
 * Builds the effective GitHub credential resolver for one server process, preferring a real
 * GitHub App installation token (Layer C's preferred architecture) and falling back to the
 * `GITHUB_TOKEN` PAT only when no App is configured at all.
 *
 * Deliberately does **not** fall back to the PAT when an App *is* configured but has no
 * installation covering the requested repository (`GitHubAppInstallationNotFoundError` propagates
 * to the caller) — silently widening to a broader shared credential would defeat the entire point
 * of installation-scoped delegation (acceptance criterion: "GitHub installation scope is enforced
 * in addition to the SymbolWright grant scope").
 */
export function createGitHubTokenResolver(
  options: GitHubTokenResolverOptions,
): GitHubTokenResolver {
  const { env } = options
  let cachedProvider: GitHubAppTokenProvider | undefined
  let appConfigured: boolean | undefined

  return async (repository) => {
    if (appConfigured === undefined) {
      const config = loadGitHubAppConfigFromEnv(env)
      appConfigured = config !== undefined
      if (config !== undefined) {
        cachedProvider = new GitHubAppTokenProvider(config, options.appProviderOptions)
      }
    }

    if (cachedProvider !== undefined) {
      if (repository === undefined) {
        // No specific repository target to scope an installation token to — the PAT fallback
        // (if any) is the only credential that can serve a repository-agnostic call.
        return env['GITHUB_TOKEN']
      }
      return cachedProvider.getTokenForRepository(repository)
    }

    return env['GITHUB_TOKEN']
  }
}
