import path from 'node:path'

import {
  DependencyAcquisitionService,
  type DependencyAcquisitionSession,
} from './dependency-acquisition-service.js'
import type { DependencyHttpsFetcher } from './dependency-https-fetcher.js'
import {
  DependencyPolicyCatalog,
  type DependencyPolicyProfile,
  type DependencyPolicyRequest,
} from './dependency-policy.js'
import {
  JsonlEgressAuditSink,
  SandboxEgressBroker,
  type EgressDnsResolver,
  type EgressHttpRequester,
  type EgressMetricsSnapshot,
  type EgressPolicyRevisionSource,
  type EgressSessionRequest,
  type EgressSessionResult,
} from './egress-broker.js'
import {
  EgressPolicyCatalog,
  type EgressPolicyProfile,
  type EgressPolicyRequest,
} from './egress-policy.js'
import type { SandboxAuthorizationContext } from './sandbox-policy-model.js'

export interface SandboxNetworkGatewayOptions {
  readonly stateRoot: string
  readonly dependencyProfiles?: readonly DependencyPolicyProfile[]
  readonly egressProfiles?: readonly EgressPolicyProfile[]
  readonly env?: NodeJS.ProcessEnv
  readonly dependencyFetcher?: DependencyHttpsFetcher
  readonly egressResolver?: EgressDnsResolver
  readonly egressRequester?: EgressHttpRequester
  readonly egressRevisionSource?: EgressPolicyRevisionSource
}

export interface SandboxDependencyAcquisitionInput {
  readonly packageJsonText: string
  readonly packageLockText: string
  readonly authorization: SandboxAuthorizationContext
  readonly request?: Omit<DependencyPolicyRequest, 'ecosystem'>
  readonly signal?: AbortSignal
}

export interface SandboxBrokeredEgressInput {
  readonly sessionId: string
  readonly authorization: SandboxAuthorizationContext
  readonly policyRequest?: EgressPolicyRequest
  readonly request: EgressSessionRequest
}

/**
 * Production entrypoint for the two network-bearing sandbox capabilities. It never changes a
 * runner's network mode: dependency acquisition and HTTPS egress remain host-side broker workflows
 * authorized independently from strong offline execution.
 */
export class SandboxNetworkGateway {
  private readonly dependencyService: DependencyAcquisitionService
  private readonly egressBroker: SandboxEgressBroker

  public constructor(options: SandboxNetworkGatewayOptions) {
    const stateRoot = path.resolve(requireNonEmpty(options.stateRoot, 'stateRoot'))
    const env = options.env ?? process.env
    this.dependencyService = new DependencyAcquisitionService({
      catalog: new DependencyPolicyCatalog(options.dependencyProfiles ?? []),
      stateRoot: path.join(stateRoot, 'dependencies'),
      env,
      ...(options.dependencyFetcher === undefined
        ? {}
        : { fetcher: options.dependencyFetcher }),
    })
    this.egressBroker = new SandboxEgressBroker({
      catalog: new EgressPolicyCatalog(options.egressProfiles ?? []),
      env,
      auditSink: new JsonlEgressAuditSink(path.join(stateRoot, 'egress')),
      ...(options.egressResolver === undefined ? {} : { resolver: options.egressResolver }),
      ...(options.egressRequester === undefined ? {} : { requester: options.egressRequester }),
      ...(options.egressRevisionSource === undefined
        ? {}
        : { revisionSource: options.egressRevisionSource }),
    })
  }

  public acquireNpm(input: SandboxDependencyAcquisitionInput): Promise<DependencyAcquisitionSession> {
    return this.dependencyService.acquireNpm(input)
  }

  public async requestEgress(input: SandboxBrokeredEgressInput): Promise<EgressSessionResult> {
    const session = this.egressBroker.openSession({
      authorization: input.authorization,
      ...(input.policyRequest === undefined ? {} : { request: input.policyRequest }),
      sessionId: input.sessionId,
    })
    try {
      return await session.request(input.request)
    } finally {
      session.close()
    }
  }

  public egressMetricsSnapshot(): EgressMetricsSnapshot {
    return this.egressBroker.metricsSnapshot()
  }
}

function requireNonEmpty(value: string, name: string): string {
  const normalized = value.trim()
  if (normalized.length === 0) throw new Error(`${name} must not be empty.`)
  return normalized
}
