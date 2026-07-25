import { sign } from 'node:crypto'
import { readFileSync } from 'node:fs'

/** A registered GitHub App's identity — the App ID and its RSA private key (PEM). */
export interface GitHubAppConfig {
  readonly appId: string
  readonly privateKeyPem: string
}

export class GitHubAppConfigError extends Error {}

/**
 * Loads GitHub App credentials from the environment, or `undefined` if no App is configured (the
 * caller should fall back to the `GITHUB_TOKEN` PAT path in that case — see
 * `docs/security/DELEGATED_AGENT_ACCESS.md`). `GITHUB_APP_PRIVATE_KEY` holds the PEM directly
 * (with real or `\n`-escaped newlines, since most secret stores can't hold literal newlines);
 * `GITHUB_APP_PRIVATE_KEY_PATH` is checked first if both are absent from the inline var, so an
 * operator can mount the key as a file instead.
 */
export function loadGitHubAppConfigFromEnv(
  env: NodeJS.ProcessEnv,
  readKeyFile: (path: string) => string = defaultReadKeyFile,
): GitHubAppConfig | undefined {
  const appId = env['GITHUB_APP_ID']?.trim()
  if (appId === undefined || appId.length === 0) return undefined

  const inlineKey = env['GITHUB_APP_PRIVATE_KEY']
  const keyPath = env['GITHUB_APP_PRIVATE_KEY_PATH']?.trim()

  let privateKeyPem: string | undefined
  if (inlineKey !== undefined && inlineKey.trim().length > 0) {
    privateKeyPem = inlineKey.includes('\\n') ? inlineKey.replaceAll('\\n', '\n') : inlineKey
  } else if (keyPath !== undefined && keyPath.length > 0) {
    privateKeyPem = readKeyFile(keyPath)
  }

  if (privateKeyPem === undefined || privateKeyPem.trim().length === 0) {
    throw new GitHubAppConfigError(
      'GITHUB_APP_ID is set but neither GITHUB_APP_PRIVATE_KEY nor GITHUB_APP_PRIVATE_KEY_PATH provides a private key.',
    )
  }
  if (!privateKeyPem.includes('BEGIN') || !privateKeyPem.includes('PRIVATE KEY')) {
    throw new GitHubAppConfigError('GitHub App private key does not look like a PEM-encoded key.')
  }

  return { appId, privateKeyPem }
}

function defaultReadKeyFile(path: string): string {
  return readFileSync(path, 'utf8')
}

function base64UrlEncode(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url')
}

const JWT_CLOCK_DRIFT_BUFFER_SECONDS = 60
/** GitHub rejects an App JWT with `exp` more than 10 minutes past `iat`; stay comfortably under. */
const JWT_LIFETIME_SECONDS = 9 * 60

/**
 * Signs a GitHub App JWT (RS256) per GitHub's App-authentication spec — `iss` is the App ID,
 * `iat`/`exp` bound a short window. This JWT authenticates as the *App itself*; it is only ever
 * used to mint short-lived, per-installation access tokens (`github-app-token-provider.ts`) — it
 * is never handed to an agent or included in a tool result.
 */
export function signGitHubAppJwt(
  config: GitHubAppConfig,
  now: () => Date = () => new Date(),
): string {
  const nowSeconds = Math.floor(now().getTime() / 1000)
  const header = { alg: 'RS256', typ: 'JWT' }
  const payload = {
    iat: nowSeconds - JWT_CLOCK_DRIFT_BUFFER_SECONDS,
    exp: nowSeconds + JWT_LIFETIME_SECONDS,
    iss: config.appId,
  }
  const signingInput = `${base64UrlEncode(JSON.stringify(header))}.${base64UrlEncode(JSON.stringify(payload))}`
  const signature = sign('RSA-SHA256', Buffer.from(signingInput), config.privateKeyPem)
  return `${signingInput}.${base64UrlEncode(signature)}`
}
