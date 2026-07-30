import { createHash } from 'node:crypto'
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
  EgressBrokerError,
  JsonlEgressAuditSink,
  SandboxEgressBroker,
  type EgressAuditSink,
  type EgressDnsResolver,
  type EgressHttpRequester,
  type EgressMetricsSnapshot,
  type EgressPolicyRevisionSource,
  type EgressSessionRequest,
  type EgressSessionResult,
} from './egress-broker.js'
import {
  EgressPolicyCatalog,
  type EgressHttpMethod,
  type EgressPolicyProfile,
  type EgressPolicyRequest,
} from './egress-policy.js'
import {
  materializeNpmDependencyLayer,
  type StrongSandboxDependencyLayer,
} from './npm-dependency-layer.js'
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
  readonly egressAuditSink?: EgressAuditSink
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
  private readonly egressAuditSink: EgressAuditSink
  private readonly stateRoot: string

  public constructor(options: SandboxNetworkGatewayOptions) {
    this.stateRoot = path.resolve(requireNonEmpty(options.stateRoot, 'stateRoot'))
    const env = options.env ?? process.env
    this.dependencyService = new DependencyAcquisitionService({
      catalog: new DependencyPolicyCatalog(options.dependencyProfiles ?? []),
      stateRoot: path.join(this.stateRoot, 'dependencies'),
      env,
      ...(options.dependencyFetcher === undefined ? {} : { fetcher: options.dependencyFetcher }),
    })
    this.egressAuditSink =
      options.egressAuditSink ?? new JsonlEgressAuditSink(path.join(this.stateRoot, 'egress'))
    this.egressBroker = new SandboxEgressBroker({
      catalog: new EgressPolicyCatalog(options.egressProfiles ?? []),
      env,
      auditSink: this.egressAuditSink,
      ...(options.egressResolver === undefined ? {} : { resolver: options.egressResolver }),
      ...(options.egressRequester === undefined ? {} : { requester: options.egressRequester }),
      ...(options.egressRevisionSource === undefined
        ? {}
        : { revisionSource: options.egressRevisionSource }),
    })
  }

  public acquireNpm(
    input: SandboxDependencyAcquisitionInput,
  ): Promise<DependencyAcquisitionSession> {
    return this.dependencyService.acquireNpm(input)
  }

  public materializeNpmLayer(
    layerId: string,
    acquisition: DependencyAcquisitionSession,
  ): Promise<StrongSandboxDependencyLayer> {
    return materializeNpmDependencyLayer({
      layerId,
      acquisition,
      stateRoot: path.join(this.stateRoot, 'dependency-layers'),
    })
  }

  public async requestEgress(input: SandboxBrokeredEgressInput): Promise<EgressSessionResult> {
    const decision = this.egressBroker.authorize(input.policyRequest ?? {}, input.authorization)
    if (!decision.allowed || decision.policy === undefined) {
      const destination = auditDestination(input.request.url)
      const failure = new EgressBrokerError(decision.reasonCode, decision.reason)
      try {
        await this.egressAuditSink.append({
          schemaVersion: 1,
          recordedAt: new Date().toISOString(),
          sessionIdHash: sha256(input.sessionId),
          policyId: input.authorization.policyReference?.id ?? 'unresolved',
          policyVersion: input.authorization.policyReference?.version ?? 0,
          policyFingerprint: 'unresolved',
          destinationHostname: destination.hostname,
          destinationPathHash: destination.pathHash,
          method: auditMethod(input.request.method),
          decision: 'denied',
          decisionCode: failure.code,
          requestCount: 0,
          bytesSent: 0,
          bytesReceived: 0,
          durationMs: 0,
          resolvedAddressClass: 'unresolved',
        })
      } catch (error) {
        throw new EgressBrokerError(
          'EGRESS_AUDIT_WRITE_FAILED',
          `Could not persist the governed egress authorization denial: ${error instanceof Error ? error.message : String(error)}`,
        )
      }
      throw failure
    }

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

function auditDestination(rawUrl: string): {
  readonly hostname: string
  readonly pathHash: string
} {
  try {
    const url = new URL(rawUrl)
    return { hostname: url.hostname, pathHash: sha256(`${url.pathname}${url.search}`) }
  } catch {
    return { hostname: 'invalid', pathHash: sha256(rawUrl) }
  }
}

function auditMethod(method: string | undefined): EgressHttpMethod {
  const normalized = method?.trim().toUpperCase()
  return normalized === 'HEAD' || normalized === 'POST' ? normalized : 'GET'
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

function requireNonEmpty(value: string, name: string): string {
  const normalized = value.trim()
  if (normalized.length === 0) throw new Error(`${name} must not be empty.`)
  return normalized
}
