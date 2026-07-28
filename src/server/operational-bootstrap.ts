import { AccessRuntime } from '../access/access-runtime.js'
import { GovernanceStore, resolveGovernanceStorePath } from '../access/governance-store.js'
import { grantMissingHostedDelegatedLimits } from '../access/hosted-limit-policy.js'
import { ProviderConcurrencyGuard } from '../access/provider-concurrency-guard.js'
import { MissionService } from '../mission/mission-service.js'
import type { ChatServerOptions } from './symbolwright-chat-server.js'
import { runBootSweep } from './boot-sweep.js'
import { DeploymentConfigError, resolveDeploymentSecurity } from './deployment-mode.js'
import { MetricsRegistry } from './metrics-registry.js'
import { ReadinessRegistry } from './readiness-registry.js'

export interface PreparedOperationalServer {
  readonly options: ChatServerOptions
  readonly warnings: readonly string[]
}

export async function prepareOperationalServerOptions(
  options: ChatServerOptions,
): Promise<PreparedOperationalServer> {
  const security = resolveDeploymentSecurity(options)
  const workspaceRoot = options.cwd ?? process.cwd()
  const missionService =
    options.missionService ??
    new MissionService({
      workspaceRoot,
      ...(options.env === undefined ? {} : { env: options.env }),
    })
  const accessRuntime = options.accessRuntime ?? new AccessRuntime({ workspaceRoot })
  const readinessRegistry = options.readinessRegistry ?? new ReadinessRegistry()
  const metricsRegistry = options.metricsRegistry ?? new MetricsRegistry()
  const concurrencyGuard = options.concurrencyGuard ?? new ProviderConcurrencyGuard()

  if (security.maxProviderConcurrency !== undefined) {
    concurrencyGuard.configurePool('provider', security.maxProviderConcurrency)
  }
  if (security.maxSseStreams !== undefined) {
    concurrencyGuard.configurePool('sse', security.maxSseStreams)
  }
  if (security.maxAutonomousExecutions !== undefined) {
    concurrencyGuard.configurePool('autonomous', security.maxAutonomousExecutions)
  }

  let governanceStore = options.governanceStore
  if (security.deploymentMode === 'hosted') {
    governanceStore ??= new GovernanceStore(resolveGovernanceStorePath(workspaceRoot))
    governanceStore.settleExpiredReservations()
    readinessRegistry.setCheck('governance_store', true)

    const invalid = accessRuntime.grantService
      .listGrants()
      .map((grant) => ({ grant, missing: grantMissingHostedDelegatedLimits(grant) }))
      .filter((entry) => entry.missing.length > 0)
    if (invalid.length > 0) {
      const detail = invalid
        .map((entry) => `${entry.grant.id}: ${entry.missing.join(', ')}`)
        .join('; ')
      governanceStore.close()
      throw new DeploymentConfigError(
        `Hosted mode refuses to start while delegated grants lack mandatory limits: ${detail}`,
      )
    }
  }

  await runBootSweep({ workspaceRoot, missionService, readiness: readinessRegistry })

  return {
    options: {
      ...options,
      deploymentMode: security.deploymentMode,
      trustedProxyCidrs: security.trustedProxyCidrSources,
      allowUnencryptedNonLoopback: security.allowUnencryptedNonLoopback,
      missionService,
      accessRuntime,
      readinessRegistry,
      metricsRegistry,
      concurrencyGuard,
      ...(governanceStore === undefined ? {} : { governanceStore }),
    },
    warnings: security.warnings,
  }
}
