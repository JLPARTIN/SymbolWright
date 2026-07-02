import type { RuntimeApproval, RuntimePolicySnapshot } from '../runtime/types.js'
import type { WebConfig } from './web-config.js'
import { isPrivateOrInternalHost, isSafeUrlScheme } from './web-safety.js'

export interface WebAccessDecision {
  readonly allowed: boolean
  readonly reason?: string
  readonly requiresApproval?: boolean
}

function allow(): WebAccessDecision {
  return { allowed: true }
}

function deny(reason: string): WebAccessDecision {
  return { allowed: false, reason }
}

function hasWebAccessApproval(approval: RuntimeApproval | undefined): boolean {
  return approval?.scopes.includes('web:access') ?? false
}

function domainMatches(hostname: string, domains: readonly string[]): boolean {
  const host = hostname.toLowerCase()
  return domains.some((domain) => {
    const normalized = domain.toLowerCase()
    return host === normalized || host.endsWith(`.${normalized}`)
  })
}

/**
 * Gate shared by fetch and search: the coarse runtime policy switch, then
 * web.enabled/mode, then (in "ask" mode) an approval ticket with web:access.
 */
function evaluateBaseWebAccess(
  webConfig: WebConfig,
  runtimePolicy: RuntimePolicySnapshot,
  approval: RuntimeApproval | undefined,
): WebAccessDecision {
  if (!runtimePolicy.allowReadOnlyNetwork) {
    return deny('Read-only network access is disabled by runtime policy.')
  }

  if (!webConfig.enabled || webConfig.mode === 'off') {
    return deny('Web access is disabled (web.mode=off).')
  }

  if (webConfig.mode === 'ask' && !hasWebAccessApproval(approval)) {
    return deny(
      'web.mode=ask requires an approval ticket with the "web:access" scope for each call.',
    )
  }

  return allow()
}

/**
 * Evaluates whether web_fetch may request `url`, per:
 *   1. hard scheme rail (http/https only, always enforced)
 *   2. runtime policy + web.mode + ask-mode approval
 *   3. private/internal network block, overridable via fetch.allowPrivateNetwork
 *   4. strict mode requires a non-empty allowedDomains list
 *   5. allowedDomains / deniedDomains (apply in every mode when configured)
 */
export function evaluateWebFetchAccess(
  url: URL,
  webConfig: WebConfig,
  runtimePolicy: RuntimePolicySnapshot,
  approval?: RuntimeApproval,
): WebAccessDecision {
  if (!isSafeUrlScheme(url)) {
    return deny(`Unsafe URL scheme "${url.protocol}" — only http/https are allowed.`)
  }

  if (!webConfig.fetch.enabled) {
    return deny('web.fetch.enabled is false.')
  }

  const base = evaluateBaseWebAccess(webConfig, runtimePolicy, approval)
  if (!base.allowed) return base

  if (isPrivateOrInternalHost(url.hostname) && !webConfig.fetch.allowPrivateNetwork) {
    return deny(
      `"${url.hostname}" is a private/internal address, blocked by default. ` +
        'Set web.fetch.allowPrivateNetwork=true (or --allow-private) to allow local/internal targets.',
    )
  }

  if (webConfig.mode === 'strict' && webConfig.fetch.allowedDomains.length === 0) {
    return deny('web.mode=strict requires a non-empty web.fetch.allowedDomains list.')
  }

  if (
    webConfig.fetch.allowedDomains.length > 0 &&
    !domainMatches(url.hostname, webConfig.fetch.allowedDomains)
  ) {
    return deny(`"${url.hostname}" is not in web.fetch.allowedDomains.`)
  }

  if (domainMatches(url.hostname, webConfig.fetch.deniedDomains)) {
    return deny(`"${url.hostname}" is in web.fetch.deniedDomains.`)
  }

  return allow()
}

/** Evaluates whether web_search may run. Search has no URL/domain surface to gate. */
export function evaluateWebSearchAccess(
  webConfig: WebConfig,
  runtimePolicy: RuntimePolicySnapshot,
  approval?: RuntimeApproval,
): WebAccessDecision {
  if (!webConfig.search.enabled) {
    return deny('web.search.enabled is false.')
  }

  return evaluateBaseWebAccess(webConfig, runtimePolicy, approval)
}
