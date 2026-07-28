import { parseTrustedProxyCidrs, type ParsedCidr } from './trusted-proxy.js'

export type SymbolWrightDeploymentMode = 'local' | 'hosted'

export class DeploymentConfigError extends Error {}

export interface DeploymentSecurityOptions {
  readonly host?: string
  readonly deploymentMode?: SymbolWrightDeploymentMode
  readonly tlsCertFile?: string
  readonly tlsKeyFile?: string
  readonly trustedProxyCidrs?: readonly string[]
  readonly allowUnencryptedNonLoopback?: boolean
  readonly maxProviderConcurrency?: number
  readonly maxSseStreams?: number
  readonly maxAutonomousExecutions?: number
}

export interface ResolvedDeploymentSecurity {
  readonly deploymentMode: SymbolWrightDeploymentMode
  readonly directTls: boolean
  readonly trustedProxyCidrs: readonly ParsedCidr[]
  readonly trustedProxyCidrSources: readonly string[]
  readonly allowUnencryptedNonLoopback: boolean
  readonly maxProviderConcurrency?: number
  readonly maxSseStreams?: number
  readonly maxAutonomousExecutions?: number
  readonly warnings: readonly string[]
}

export function isLoopbackHost(host: string): boolean {
  const normalized = host
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, '')
  return normalized === 'localhost' || normalized === '::1' || normalized.startsWith('127.')
}

function positiveInteger(value: number | undefined, name: string): number | undefined {
  if (value === undefined) return undefined
  if (!Number.isInteger(value) || value < 1) {
    throw new DeploymentConfigError(`${name} must be a positive integer.`)
  }
  return value
}

export function resolveDeploymentSecurity(
  options: DeploymentSecurityOptions,
): ResolvedDeploymentSecurity {
  const deploymentMode = options.deploymentMode ?? 'local'
  if (deploymentMode !== 'local' && deploymentMode !== 'hosted') {
    throw new DeploymentConfigError(
      `SYMBOLWRIGHT_DEPLOYMENT_MODE must be "local" or "hosted", received ${String(deploymentMode)}.`,
    )
  }

  const hasCert = options.tlsCertFile !== undefined
  const hasKey = options.tlsKeyFile !== undefined
  if (hasCert !== hasKey) {
    throw new DeploymentConfigError(
      'Direct TLS requires both SYMBOLWRIGHT_TLS_CERT_FILE and SYMBOLWRIGHT_TLS_KEY_FILE.',
    )
  }
  const directTls = hasCert && hasKey
  const trustedProxyCidrs = parseTrustedProxyCidrs(options.trustedProxyCidrs)
  const proxyMode = trustedProxyCidrs.length > 0
  if (directTls && proxyMode) {
    throw new DeploymentConfigError(
      'Choose exactly one network-termination mode: direct TLS or trusted reverse proxy, not both.',
    )
  }

  const host = options.host ?? '127.0.0.1'
  const allowUnencryptedNonLoopback = options.allowUnencryptedNonLoopback === true
  const maxProviderConcurrency = positiveInteger(
    options.maxProviderConcurrency,
    'SYMBOLWRIGHT_MAX_PROVIDER_CONCURRENCY',
  )
  const maxSseStreams = positiveInteger(options.maxSseStreams, 'SYMBOLWRIGHT_MAX_SSE_STREAMS')
  const maxAutonomousExecutions = positiveInteger(
    options.maxAutonomousExecutions,
    'SYMBOLWRIGHT_MAX_AUTONOMOUS_EXECUTIONS',
  )

  const warnings: string[] = []
  if (deploymentMode === 'hosted') {
    if (allowUnencryptedNonLoopback) {
      throw new DeploymentConfigError(
        'SYMBOLWRIGHT_ALLOW_UNENCRYPTED_NON_LOOPBACK is a local-development escape hatch and is forbidden in hosted mode.',
      )
    }
    if (!directTls && !proxyMode) {
      throw new DeploymentConfigError(
        'Hosted mode requires direct TLS or SYMBOLWRIGHT_TRUSTED_PROXY_CIDRS with verified forwarded HTTPS.',
      )
    }
    const missing = [
      maxProviderConcurrency === undefined ? 'SYMBOLWRIGHT_MAX_PROVIDER_CONCURRENCY' : undefined,
      maxSseStreams === undefined ? 'SYMBOLWRIGHT_MAX_SSE_STREAMS' : undefined,
      maxAutonomousExecutions === undefined ? 'SYMBOLWRIGHT_MAX_AUTONOMOUS_EXECUTIONS' : undefined,
    ].filter((value): value is string => value !== undefined)
    if (missing.length > 0) {
      throw new DeploymentConfigError(
        `Hosted mode requires explicit process-local concurrency caps: ${missing.join(', ')}.`,
      )
    }
  } else if (!isLoopbackHost(host) && !directTls && !proxyMode) {
    if (!allowUnencryptedNonLoopback) {
      throw new DeploymentConfigError(
        'Refusing non-loopback plaintext binding. Configure direct TLS, trusted-proxy mode, or explicitly set SYMBOLWRIGHT_ALLOW_UNENCRYPTED_NON_LOOPBACK=true for local development only.',
      )
    }
    warnings.push(
      'Development escape hatch enabled: non-loopback plaintext HTTP is allowed in local mode. Do not expose this process publicly.',
    )
  }

  return {
    deploymentMode,
    directTls,
    trustedProxyCidrs,
    trustedProxyCidrSources: trustedProxyCidrs.map((cidr) => cidr.source),
    allowUnencryptedNonLoopback,
    ...(maxProviderConcurrency === undefined ? {} : { maxProviderConcurrency }),
    ...(maxSseStreams === undefined ? {} : { maxSseStreams }),
    ...(maxAutonomousExecutions === undefined ? {} : { maxAutonomousExecutions }),
    warnings,
  }
}
