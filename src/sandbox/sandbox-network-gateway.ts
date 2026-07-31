import { createHash } from 'node:crypto'
import path from 'node:path'

import {
  ConcurrencyLimitExceededError,
  ProviderConcurrencyGuard,
} from '../access/provider-concurrency-guard.js'
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

/** Process-local, not restart-durable -- exactly like the `ProviderConcurrencyGuard` pools this
 * reuses for provider/SSE/autonomous work. Bounds how much of this one process's capacity any
 * single workspace's egress or dependency acquisition can consume at once, above and beyond each
 * individual session's/acquisition's own `limits.maxConcurrency`. Does not, and cannot, enforce
 * anything across multiple processes or hosts. */
const SANDBOX_EGRESS_CONCURRENCY_POOL = 'sandbox-egress'
const SANDBOX_DEPENDENCY_CONCURRENCY_POOL = 'sandbox-dependency'
const DEFAULT_MAX_SANDBOX_EGRESS_CONCURRENCY = 20
const DEFAULT_MAX_SANDBOX_DEPENDENCY_CONCURRENCY = 4

export interface SandboxNetworkAggregateConcurrencySnapshot {
  readonly egress: { readonly active: number; readonly limit: number }
  readonly dependency: { readonly active: number; readonly limit: number }
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
  private readonly concurrencyGuard: ProviderConcurrencyGuard

  public constructor(options: SandboxNetworkGatewayOptions) {
    this.stateRoot = path.resolve(requireNonEmpty(options.stateRoot, 'stateRoot'))
    const env = options.env ?? process.env
    this.concurrencyGuard = new ProviderConcurrencyGuard({
      [SANDBOX_EGRESS_CONCURRENCY_POOL]: {
        limit: positiveIntFromEnv(
          env['SYMBOLWRIGHT_MAX_SANDBOX_EGRESS_CONCURRENCY'],
          DEFAULT_MAX_SANDBOX_EGRESS_CONCURRENCY,
        ),
      },
      [SANDBOX_DEPENDENCY_CONCURRENCY_POOL]: {
        limit: positiveIntFromEnv(
          env['SYMBOLWRIGHT_MAX_SANDBOX_DEPENDENCY_CONCURRENCY'],
          DEFAULT_MAX_SANDBOX_DEPENDENCY_CONCURRENCY,
        ),
      },
    })
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

  public async acquireNpm(
    input: SandboxDependencyAcquisitionInput,
  ): Promise<DependencyAcquisitionSession> {
    let release: (() => void) | undefined
    try {
      release = this.concurrencyGuard.acquire(SANDBOX_DEPENDENCY_CONCURRENCY_POOL)
    } catch (error) {
      if (error instanceof ConcurrencyLimitExceededError) {
        throw new Error(
          `DEPENDENCY_PROCESS_CONCURRENCY_EXCEEDED: this process already has ${error.limit} concurrent dependency acquisition(s) in flight; try again shortly.`,
        )
      }
      throw error
    }
    try {
      return await this.dependencyService.acquireNpm(input)
    } finally {
      release()
    }
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

    let release: (() => void) | undefined
    try {
      release = this.concurrencyGuard.acquire(SANDBOX_EGRESS_CONCURRENCY_POOL)
    } catch (error) {
      if (error instanceof ConcurrencyLimitExceededError) {
        const destination = auditDestination(input.request.url)
        const failure = new EgressBrokerError(
          'SANDBOX_EGRESS_PROCESS_CONCURRENCY_EXCEEDED',
          `This process already has ${error.limit} concurrent egress request(s) in flight; try again shortly.`,
        )
        try {
          await this.egressAuditSink.append({
            schemaVersion: 1,
            recordedAt: new Date().toISOString(),
            sessionIdHash: sha256(input.sessionId),
            policyId: decision.policy.policyId,
            policyVersion: decision.policy.policyVersion,
            policyFingerprint: decision.policy.fingerprint,
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
        } catch (auditError) {
          throw new EgressBrokerError(
            'EGRESS_AUDIT_WRITE_FAILED',
            `Could not persist the governed egress concurrency denial: ${auditError instanceof Error ? auditError.message : String(auditError)}`,
          )
        }
        throw failure
      }
      throw error
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
      release()
    }
  }

  public aggregateConcurrencySnapshot(): SandboxNetworkAggregateConcurrencySnapshot {
    return {
      egress: {
        active: this.concurrencyGuard.activeCount(SANDBOX_EGRESS_CONCURRENCY_POOL),
        limit: this.concurrencyGuard.limitFor(SANDBOX_EGRESS_CONCURRENCY_POOL) ?? 0,
      },
      dependency: {
        active: this.concurrencyGuard.activeCount(SANDBOX_DEPENDENCY_CONCURRENCY_POOL),
        limit: this.concurrencyGuard.limitFor(SANDBOX_DEPENDENCY_CONCURRENCY_POOL) ?? 0,
      },
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

function positiveIntFromEnv(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}
