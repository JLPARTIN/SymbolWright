import { createHash } from 'node:crypto'
import { promises as dns, type LookupAddress } from 'node:dns'
import { promises as fs } from 'node:fs'
import https from 'node:https'
import path from 'node:path'
import { type LookupFunction } from 'node:net'

import { isPublicDependencyAddress } from './dependency-https-fetcher.js'
import {
  EGRESS_GLOBAL_POLICY_ID,
  EgressPolicyCatalog,
  EgressPolicyError,
  authorizeEgressRequest,
  isHostAllowedByEgressPolicy,
  resolveEffectiveEgressPolicy,
  type EffectiveEgressPolicy,
  type EgressHttpMethod,
  type EgressPolicyDecision,
  type EgressPolicyRequest,
  type EgressRequestDescriptor,
} from './egress-policy.js'
import type { SandboxAuthorizationContext } from './sandbox-policy-model.js'

export interface EgressResolvedAddress {
  readonly address: string
  readonly family: 4 | 6
}

export interface EgressDnsResolution {
  readonly addresses: readonly EgressResolvedAddress[]
  readonly cnameChain: readonly string[]
}

export interface EgressDnsResolver {
  readonly resolve: (hostname: string) => Promise<EgressDnsResolution>
}

export interface EgressHttpResponse {
  readonly statusCode: number
  readonly headers: Readonly<Record<string, string | readonly string[] | undefined>>
  readonly body: Uint8Array
}

export interface EgressHttpRequester {
  readonly request: (input: {
    readonly url: URL
    readonly method: EgressHttpMethod
    readonly pinnedAddress: EgressResolvedAddress
    readonly headers: Readonly<Record<string, string>>
    readonly body: Uint8Array
    readonly maxResponseBytes: number
    readonly timeoutMs: number
    readonly signal?: AbortSignal
  }) => Promise<EgressHttpResponse>
}

export interface EgressPolicyRevisionSnapshot {
  readonly globalVersion: number
  readonly policyVersion: number
  readonly emergencyDisabled: boolean
}

export interface EgressPolicyRevisionSource {
  readonly read: (policy: EffectiveEgressPolicy) => EgressPolicyRevisionSnapshot
}

export interface EgressAuditRecord {
  readonly schemaVersion: 1
  readonly recordedAt: string
  readonly sessionIdHash: string
  readonly policyId: string
  readonly policyVersion: number
  readonly policyFingerprint: string
  readonly destinationHostname: string
  readonly destinationPathHash: string
  readonly method: EgressHttpMethod
  readonly decision: 'allowed' | 'denied'
  readonly decisionCode: string
  readonly requestCount: number
  readonly bytesSent: number
  readonly bytesReceived: number
  readonly durationMs: number
  readonly resolvedAddressClass: 'public' | 'forbidden' | 'unresolved'
  readonly statusCode?: number
}

export interface EgressAuditSink {
  readonly append: (record: EgressAuditRecord) => Promise<void>
}

export interface EgressMetricsSnapshot {
  readonly activeSessions: number
  readonly activeRequests: number
  readonly allowedRequests: number
  readonly deniedRequests: number
  readonly quotaExhaustions: number
  readonly cancellations: number
  readonly policyRevocations: number
  readonly bytesSent: number
  readonly bytesReceived: number
}

export interface SandboxEgressBrokerOptions {
  readonly env?: NodeJS.ProcessEnv
  readonly catalog?: EgressPolicyCatalog
  readonly resolver?: EgressDnsResolver
  readonly requester?: EgressHttpRequester
  readonly revisionSource?: EgressPolicyRevisionSource
  readonly auditSink?: EgressAuditSink
  readonly metrics?: EgressMetrics
  readonly now?: () => Date
  readonly monotonicNow?: () => number
}

export interface EgressSessionRequest {
  readonly url: string
  readonly method?: string
  readonly headers?: Readonly<Record<string, string>>
  readonly body?: string | Uint8Array
  readonly signal?: AbortSignal
}

export interface EgressSessionResult {
  readonly statusCode: number
  readonly headers: Readonly<Record<string, string | readonly string[] | undefined>>
  readonly body: Uint8Array
  readonly finalUrl: string
  readonly requestCount: number
  readonly bytesSent: number
  readonly bytesReceived: number
}

export class EgressBrokerError extends Error {
  public readonly code: string

  public constructor(code: string, message: string) {
    super(message)
    this.name = 'EgressBrokerError'
    this.code = code
  }
}

export class EgressMetrics {
  private activeSessions = 0
  private activeRequests = 0
  private allowedRequests = 0
  private deniedRequests = 0
  private quotaExhaustions = 0
  private cancellations = 0
  private policyRevocations = 0
  private bytesSent = 0
  private bytesReceived = 0

  public sessionOpened(): void {
    this.activeSessions += 1
  }

  public sessionClosed(): void {
    this.activeSessions = Math.max(0, this.activeSessions - 1)
  }

  public requestStarted(): void {
    this.activeRequests += 1
  }

  public requestFinished(input: {
    readonly allowed: boolean
    readonly code: string
    readonly bytesSent: number
    readonly bytesReceived: number
  }): void {
    this.activeRequests = Math.max(0, this.activeRequests - 1)
    if (input.allowed) this.allowedRequests += 1
    else this.deniedRequests += 1
    if (input.code.includes('QUOTA') || input.code === 'EGRESS_CONCURRENCY_EXCEEDED') {
      this.quotaExhaustions += 1
    }
    if (input.code === 'EGRESS_CANCELLED') this.cancellations += 1
    if (input.code === 'EGRESS_POLICY_REVOKED') this.policyRevocations += 1
    this.bytesSent += input.bytesSent
    this.bytesReceived += input.bytesReceived
  }

  public snapshot(): EgressMetricsSnapshot {
    return Object.freeze({
      activeSessions: this.activeSessions,
      activeRequests: this.activeRequests,
      allowedRequests: this.allowedRequests,
      deniedRequests: this.deniedRequests,
      quotaExhaustions: this.quotaExhaustions,
      cancellations: this.cancellations,
      policyRevocations: this.policyRevocations,
      bytesSent: this.bytesSent,
      bytesReceived: this.bytesReceived,
    })
  }
}

export class InMemoryEgressAuditSink implements EgressAuditSink {
  private readonly records: EgressAuditRecord[] = []

  public async append(record: EgressAuditRecord): Promise<void> {
    this.records.push(Object.freeze({ ...record }))
  }

  public snapshot(): readonly EgressAuditRecord[] {
    return Object.freeze([...this.records])
  }
}

export class JsonlEgressAuditSink implements EgressAuditSink {
  private readonly filePath: string
  private pending: Promise<void> = Promise.resolve()

  public constructor(stateRoot: string) {
    this.filePath = path.join(stateRoot, 'sandbox-egress-audit.jsonl')
  }

  public async append(record: EgressAuditRecord): Promise<void> {
    this.pending = this.pending.then(async () => {
      await ensureSafeAuditParent(path.dirname(this.filePath))
      const line = `${JSON.stringify(record)}\n`
      const handle = await fs.open(this.filePath, 'a', 0o600)
      try {
        await handle.writeFile(line, 'utf8')
        await handle.sync()
      } finally {
        await handle.close()
      }
    })
    return this.pending
  }
}

/**
 * Host-side broker for explicitly approved HTTP traffic. Strong sandbox containers remain
 * `--network none`; they never receive a bridge, host network, proxy environment, or raw socket
 * route. A caller can only request bounded HTTP operations through this object after policy
 * resolution succeeds.
 */
export class SandboxEgressBroker {
  private readonly env: NodeJS.ProcessEnv
  private readonly catalog: EgressPolicyCatalog
  private readonly resolver: EgressDnsResolver
  private readonly requester: EgressHttpRequester
  private readonly revisionSource: EgressPolicyRevisionSource
  private readonly auditSink: EgressAuditSink
  private readonly metrics: EgressMetrics
  private readonly now: () => Date
  private readonly monotonicNow: () => number

  public constructor(options: SandboxEgressBrokerOptions = {}) {
    this.env = options.env ?? process.env
    this.catalog = options.catalog ?? new EgressPolicyCatalog()
    this.resolver = options.resolver ?? new SystemEgressDnsResolver()
    this.requester = options.requester ?? new NodeEgressHttpsRequester()
    this.revisionSource =
      options.revisionSource ?? new EnvironmentEgressPolicyRevisionSource(this.env)
    this.auditSink = options.auditSink ?? new InMemoryEgressAuditSink()
    this.metrics = options.metrics ?? new EgressMetrics()
    this.now = options.now ?? (() => new Date())
    this.monotonicNow = options.monotonicNow ?? (() => Date.now())
  }

  public authorize(
    request: EgressPolicyRequest,
    authorization: SandboxAuthorizationContext,
  ): EgressPolicyDecision {
    return resolveEffectiveEgressPolicy({
      request,
      authorization,
      catalog: this.catalog,
      env: this.env,
      now: this.now,
    })
  }

  public openSession(input: {
    readonly authorization: SandboxAuthorizationContext
    readonly request?: EgressPolicyRequest
    readonly sessionId: string
  }): SandboxEgressSession {
    const decision = this.authorize(input.request ?? {}, input.authorization)
    if (!decision.allowed || decision.policy === undefined) {
      throw new EgressBrokerError(decision.reasonCode, decision.reason)
    }
    this.metrics.sessionOpened()
    return new SandboxEgressSession({
      policy: decision.policy,
      sessionId: input.sessionId,
      env: this.env,
      resolver: this.resolver,
      requester: this.requester,
      revisionSource: this.revisionSource,
      auditSink: this.auditSink,
      metrics: this.metrics,
      now: this.now,
      monotonicNow: this.monotonicNow,
    })
  }

  public metricsSnapshot(): EgressMetricsSnapshot {
    return this.metrics.snapshot()
  }
}

interface SandboxEgressSessionOptions {
  readonly policy: EffectiveEgressPolicy
  readonly sessionId: string
  readonly env: NodeJS.ProcessEnv
  readonly resolver: EgressDnsResolver
  readonly requester: EgressHttpRequester
  readonly revisionSource: EgressPolicyRevisionSource
  readonly auditSink: EgressAuditSink
  readonly metrics: EgressMetrics
  readonly now: () => Date
  readonly monotonicNow: () => number
}

export class SandboxEgressSession {
  private readonly policy: EffectiveEgressPolicy
  private readonly sessionIdHash: string
  private readonly env: NodeJS.ProcessEnv
  private readonly resolver: EgressDnsResolver
  private readonly requester: EgressHttpRequester
  private readonly revisionSource: EgressPolicyRevisionSource
  private readonly auditSink: EgressAuditSink
  private readonly metrics: EgressMetrics
  private readonly now: () => Date
  private readonly monotonicNow: () => number
  private readonly startedAt: number
  private requestCount = 0
  private bytesSent = 0
  private bytesReceived = 0
  private activeRequests = 0
  private closed = false

  public constructor(options: SandboxEgressSessionOptions) {
    this.policy = options.policy
    this.sessionIdHash = sha256(options.sessionId)
    this.env = options.env
    this.resolver = options.resolver
    this.requester = options.requester
    this.revisionSource = options.revisionSource
    this.auditSink = options.auditSink
    this.metrics = options.metrics
    this.now = options.now
    this.monotonicNow = options.monotonicNow
    this.startedAt = this.monotonicNow()
  }

  public close(): void {
    if (this.closed) return
    this.closed = true
    this.metrics.sessionClosed()
  }

  public async request(input: EgressSessionRequest): Promise<EgressSessionResult> {
    if (this.closed) {
      throw new EgressBrokerError('EGRESS_SESSION_CLOSED', 'The egress session is closed.')
    }
    if (this.activeRequests >= this.policy.limits.maxConcurrency) {
      this.metrics.requestStarted()
      this.metrics.requestFinished({
        allowed: false,
        code: 'EGRESS_CONCURRENCY_EXCEEDED',
        bytesSent: 0,
        bytesReceived: 0,
      })
      throw new EgressBrokerError(
        'EGRESS_CONCURRENCY_EXCEEDED',
        `Egress session concurrency exceeds ${this.policy.limits.maxConcurrency}.`,
      )
    }

    const body = toBytes(input.body)
    const descriptor: EgressRequestDescriptor = {
      url: input.url,
      ...(input.method === undefined ? {} : { method: input.method }),
      ...(input.headers === undefined ? {} : { headers: input.headers }),
      bodyBytes: body.byteLength,
    }
    const authorized = mapPolicyError(() => authorizeEgressRequest(this.policy, descriptor))
    const operationStartedAt = this.monotonicNow()
    this.activeRequests += 1
    this.metrics.requestStarted()

    let current = authorized.url
    let method = authorized.method
    let headers = authorized.headers
    let currentBody = body
    let hopCount = 0
    let operationSent = 0
    let operationReceived = 0
    let selectedAddressClass: EgressAuditRecord['resolvedAddressClass'] = 'unresolved'
    let statusCode: number | undefined
    let decisionCode = 'EGRESS_REQUEST_ALLOWED'

    try {
      for (;;) {
        assertNotCancelled(input.signal)
        this.assertPolicyCurrent()
        this.assertWithinDuration()
        this.reserveRequest(currentBody.byteLength)
        operationSent += currentBody.byteLength

        const resolution = await this.resolver.resolve(current.hostname)
        validateCnameChain(resolution.cnameChain, this.policy)
        const addresses = uniqueAddresses(resolution.addresses)
        if (addresses.length === 0) {
          throw new EgressBrokerError(
            'EGRESS_DNS_EMPTY',
            `Egress destination did not resolve: ${current.hostname}`,
          )
        }
        if (addresses.some((entry) => !isPublicDependencyAddress(entry))) {
          selectedAddressClass = 'forbidden'
          throw new EgressBrokerError(
            'EGRESS_DNS_DESTINATION_FORBIDDEN',
            `Egress DNS included a forbidden destination class for ${current.hostname}.`,
          )
        }
        selectedAddressClass = 'public'
        const selected = addresses[0]
        if (selected === undefined) {
          throw new EgressBrokerError(
            'EGRESS_DNS_EMPTY',
            `Egress destination did not resolve: ${current.hostname}`,
          )
        }

        const remainingMs = this.remainingDurationMs()
        const response = await this.requester.request({
          url: current,
          method,
          pinnedAddress: selected,
          headers,
          body: currentBody,
          maxResponseBytes: this.policy.limits.maxResponseBytes,
          timeoutMs: remainingMs,
          ...(input.signal === undefined ? {} : { signal: input.signal }),
        })
        assertNotCancelled(input.signal)
        this.assertPolicyCurrent()
        statusCode = response.statusCode
        operationReceived += response.body.byteLength
        this.bytesReceived += response.body.byteLength
        if (this.bytesReceived > this.policy.limits.maxTotalReceivedBytes) {
          throw new EgressBrokerError(
            'EGRESS_RECEIVE_QUOTA_EXCEEDED',
            `Egress session received more than ${this.policy.limits.maxTotalReceivedBytes} bytes.`,
          )
        }

        if (REDIRECT_STATUS_CODES.has(response.statusCode)) {
          hopCount += 1
          if (this.policy.redirectPolicy === 'denied') {
            throw new EgressBrokerError(
              'EGRESS_REDIRECT_DENIED',
              'The operator-owned egress profile denies redirects.',
            )
          }
          if (hopCount > this.policy.limits.maxRedirects) {
            throw new EgressBrokerError(
              'EGRESS_REDIRECT_QUOTA_EXCEEDED',
              `Egress request exceeded ${this.policy.limits.maxRedirects} redirects.`,
            )
          }
          const location = firstHeader(response.headers['location'])
          if (location === undefined) {
            throw new EgressBrokerError(
              'EGRESS_REDIRECT_INVALID',
              'Egress redirect did not include a Location header.',
            )
          }
          let next: ReturnType<typeof authorizeEgressRequest>
          try {
            next = authorizeEgressRequest(this.policy, {
              url: new URL(location, current).toString(),
              method,
              headers,
              bodyBytes: currentBody.byteLength,
            })
          } catch (error) {
            throw mapToBrokerError(error)
          }
          if (
            this.policy.redirectPolicy === 'same-host' &&
            next.url.hostname !== current.hostname
          ) {
            throw new EgressBrokerError(
              'EGRESS_REDIRECT_HOST_DENIED',
              'The egress profile permits redirects only within the original host.',
            )
          }
          current = next.url
          headers = stripSensitiveHeaders(next.headers)
          if (
            response.statusCode === 303 ||
            ((response.statusCode === 301 || response.statusCode === 302) && method === 'POST')
          ) {
            method = 'GET'
            currentBody = new Uint8Array()
          }
          continue
        }

        decisionCode = 'EGRESS_REQUEST_ALLOWED'
        await this.appendAudit({
          url: current,
          method,
          decision: 'allowed',
          decisionCode,
          requestCount: hopCount + 1,
          bytesSent: operationSent,
          bytesReceived: operationReceived,
          durationMs: this.monotonicNow() - operationStartedAt,
          resolvedAddressClass: selectedAddressClass,
          statusCode: response.statusCode,
        })
        this.metrics.requestFinished({
          allowed: true,
          code: decisionCode,
          bytesSent: operationSent,
          bytesReceived: operationReceived,
        })
        return Object.freeze({
          statusCode: response.statusCode,
          headers: response.headers,
          body: response.body,
          finalUrl: current.toString(),
          requestCount: hopCount + 1,
          bytesSent: operationSent,
          bytesReceived: operationReceived,
        })
      }
    } catch (error) {
      const brokerError = mapToBrokerError(error)
      decisionCode = brokerError.code
      await this.appendAudit({
        url: current,
        method,
        decision: 'denied',
        decisionCode,
        requestCount: Math.max(1, hopCount + 1),
        bytesSent: operationSent,
        bytesReceived: operationReceived,
        durationMs: this.monotonicNow() - operationStartedAt,
        resolvedAddressClass: selectedAddressClass,
        ...(statusCode === undefined ? {} : { statusCode }),
      })
      this.metrics.requestFinished({
        allowed: false,
        code: decisionCode,
        bytesSent: operationSent,
        bytesReceived: operationReceived,
      })
      throw brokerError
    } finally {
      this.activeRequests = Math.max(0, this.activeRequests - 1)
    }
  }

  public snapshot(): Readonly<{
    requestCount: number
    bytesSent: number
    bytesReceived: number
    activeRequests: number
    closed: boolean
  }> {
    return Object.freeze({
      requestCount: this.requestCount,
      bytesSent: this.bytesSent,
      bytesReceived: this.bytesReceived,
      activeRequests: this.activeRequests,
      closed: this.closed,
    })
  }

  private reserveRequest(bodyBytes: number): void {
    this.requestCount += 1
    if (this.requestCount > this.policy.limits.maxRequests) {
      throw new EgressBrokerError(
        'EGRESS_REQUEST_QUOTA_EXCEEDED',
        `Egress session exceeded ${this.policy.limits.maxRequests} network requests.`,
      )
    }
    this.bytesSent += bodyBytes
    if (this.bytesSent > this.policy.limits.maxTotalSentBytes) {
      throw new EgressBrokerError(
        'EGRESS_SEND_QUOTA_EXCEEDED',
        `Egress session sent more than ${this.policy.limits.maxTotalSentBytes} bytes.`,
      )
    }
  }

  private assertWithinDuration(): void {
    if (this.remainingDurationMs() <= 0) {
      throw new EgressBrokerError(
        'EGRESS_TIMEOUT',
        'Egress session exceeded the effective policy duration.',
      )
    }
  }

  private remainingDurationMs(): number {
    return this.policy.limits.timeoutMs - (this.monotonicNow() - this.startedAt)
  }

  private assertPolicyCurrent(): void {
    if (this.env['SYMBOLWRIGHT_DISABLE_SANDBOX_EGRESS'] === 'true') {
      throw new EgressBrokerError(
        'EGRESS_POLICY_REVOKED',
        'Brokered egress was disabled while the session was active.',
      )
    }
    const current = this.revisionSource.read(this.policy)
    if (
      current.emergencyDisabled ||
      current.globalVersion !== sourceVersion(this.policy, EGRESS_GLOBAL_POLICY_ID) ||
      current.policyVersion !== this.policy.policyVersion
    ) {
      throw new EgressBrokerError(
        'EGRESS_POLICY_REVOKED',
        'The operator-owned egress policy changed or was revoked while the session was active.',
      )
    }
  }

  private async appendAudit(
    input: Omit<
      EgressAuditRecord,
      | 'schemaVersion'
      | 'recordedAt'
      | 'sessionIdHash'
      | 'policyId'
      | 'policyVersion'
      | 'policyFingerprint'
      | 'destinationHostname'
      | 'destinationPathHash'
    > & { readonly url: URL },
  ): Promise<void> {
    try {
      await this.auditSink.append(
        Object.freeze({
          schemaVersion: 1,
          recordedAt: this.now().toISOString(),
          sessionIdHash: this.sessionIdHash,
          policyId: this.policy.policyId,
          policyVersion: this.policy.policyVersion,
          policyFingerprint: this.policy.fingerprint,
          destinationHostname: input.url.hostname,
          destinationPathHash: sha256(`${input.url.pathname}${input.url.search}`),
          method: input.method,
          decision: input.decision,
          decisionCode: input.decisionCode,
          requestCount: input.requestCount,
          bytesSent: input.bytesSent,
          bytesReceived: input.bytesReceived,
          durationMs: input.durationMs,
          resolvedAddressClass: input.resolvedAddressClass,
          ...(input.statusCode === undefined ? {} : { statusCode: input.statusCode }),
        }),
      )
    } catch (error) {
      throw new EgressBrokerError(
        'EGRESS_AUDIT_WRITE_FAILED',
        `Brokered egress audit persistence failed: ${errorMessage(error)}`,
      )
    }
  }
}

export class SystemEgressDnsResolver implements EgressDnsResolver {
  public async resolve(hostname: string): Promise<EgressDnsResolution> {
    const cnameChain: string[] = []
    let current = hostname
    for (let depth = 0; depth < 8; depth += 1) {
      let names: string[]
      try {
        names = await dns.resolveCname(current)
      } catch (error) {
        if (isDnsNoData(error)) break
        throw new EgressBrokerError(
          'EGRESS_DNS_FAILED',
          `Egress CNAME resolution failed: ${errorMessage(error)}`,
        )
      }
      const normalized = [
        ...new Set(names.map((name) => name.toLowerCase().replace(/\.$/, ''))),
      ].sort()
      if (normalized.length === 0) break
      if (normalized.length > 1) {
        throw new EgressBrokerError(
          'EGRESS_DNS_AMBIGUOUS_CNAME',
          'Egress DNS returned multiple CNAME targets.',
        )
      }
      const next = normalized[0]
      if (next === undefined || cnameChain.includes(next)) {
        throw new EgressBrokerError(
          'EGRESS_DNS_CNAME_LOOP',
          'Egress DNS CNAME chain contains a loop.',
        )
      }
      cnameChain.push(next)
      current = next
    }
    if (cnameChain.length >= 8) {
      throw new EgressBrokerError(
        'EGRESS_DNS_CNAME_DEPTH_EXCEEDED',
        'Egress DNS CNAME chain exceeded the maximum depth.',
      )
    }

    let addresses: LookupAddress[]
    try {
      addresses = await dns.lookup(hostname, { all: true, verbatim: true })
    } catch (error) {
      throw new EgressBrokerError(
        'EGRESS_DNS_FAILED',
        `Egress DNS resolution failed: ${errorMessage(error)}`,
      )
    }
    return Object.freeze({
      addresses: Object.freeze(
        addresses.map((entry) => ({
          address: entry.address,
          family: entry.family === 6 ? (6 as const) : (4 as const),
        })),
      ),
      cnameChain: Object.freeze(cnameChain),
    })
  }
}

export class NodeEgressHttpsRequester implements EgressHttpRequester {
  public async request(input: {
    readonly url: URL
    readonly method: EgressHttpMethod
    readonly pinnedAddress: EgressResolvedAddress
    readonly headers: Readonly<Record<string, string>>
    readonly body: Uint8Array
    readonly maxResponseBytes: number
    readonly timeoutMs: number
    readonly signal?: AbortSignal
  }): Promise<EgressHttpResponse> {
    return new Promise<EgressHttpResponse>((resolve, reject) => {
      let settled = false
      let total = 0
      const chunks: Buffer[] = []
      const lookup: LookupFunction = (_hostname, options, callback) => {
        if (typeof options === 'object' && options.all === true) {
          callback(null, [input.pinnedAddress])
          return
        }
        callback(null, input.pinnedAddress.address, input.pinnedAddress.family)
      }
      const headers: Record<string, string | number> = {
        accept: 'application/octet-stream, application/json;q=0.9, */*;q=0.1',
        'user-agent': 'SymbolWright-Egress-Broker/1',
        ...input.headers,
      }
      if (input.body.byteLength > 0) headers['content-length'] = input.body.byteLength
      const request = https.request(
        {
          protocol: 'https:',
          hostname: input.url.hostname,
          port: input.url.port.length === 0 ? 443 : Number(input.url.port),
          path: `${input.url.pathname}${input.url.search}`,
          method: input.method,
          servername: input.url.hostname,
          lookup,
          agent: false,
          rejectUnauthorized: true,
          headers,
        },
        (response) => {
          response.on('data', (chunk: Buffer) => {
            if (settled) return
            total += chunk.byteLength
            if (total > input.maxResponseBytes) {
              fail(
                new EgressBrokerError(
                  'EGRESS_RESPONSE_QUOTA_EXCEEDED',
                  `Egress response exceeded ${input.maxResponseBytes} bytes.`,
                ),
              )
              request.destroy()
              return
            }
            chunks.push(chunk)
          })
          response.once('end', () => {
            if (settled) return
            settled = true
            resolve({
              statusCode: response.statusCode ?? 0,
              headers: normalizeHeaders(response.headers),
              body: Buffer.concat(chunks),
            })
          })
          response.once('error', fail)
        },
      )
      const timeout = setTimeout(() => {
        fail(new EgressBrokerError('EGRESS_TIMEOUT', 'Brokered egress request timed out.'))
        request.destroy()
      }, input.timeoutMs)
      timeout.unref()

      const onAbort = (): void => {
        fail(new EgressBrokerError('EGRESS_CANCELLED', 'Brokered egress request was cancelled.'))
        request.destroy()
      }
      input.signal?.addEventListener('abort', onAbort, { once: true })
      request.once('error', fail)
      request.once('close', () => {
        clearTimeout(timeout)
        input.signal?.removeEventListener('abort', onAbort)
      })
      if (input.body.byteLength > 0) request.write(input.body)
      request.end()

      function fail(error: unknown): void {
        if (settled) return
        settled = true
        clearTimeout(timeout)
        input.signal?.removeEventListener('abort', onAbort)
        reject(
          error instanceof EgressBrokerError
            ? error
            : new EgressBrokerError(
                'EGRESS_HTTPS_FAILED',
                `Brokered egress HTTPS request failed: ${errorMessage(error)}`,
              ),
        )
      }
    })
  }
}

export class EnvironmentEgressPolicyRevisionSource implements EgressPolicyRevisionSource {
  public constructor(private readonly env: NodeJS.ProcessEnv) {}

  public read(policy: EffectiveEgressPolicy): EgressPolicyRevisionSnapshot {
    return {
      globalVersion: positiveInteger(
        this.env['SYMBOLWRIGHT_EGRESS_GLOBAL_POLICY_VERSION'],
        sourceVersion(policy, EGRESS_GLOBAL_POLICY_ID),
      ),
      policyVersion: positiveInteger(
        this.env[`SYMBOLWRIGHT_EGRESS_POLICY_VERSION_${environmentKey(policy.policyId)}`],
        policy.policyVersion,
      ),
      emergencyDisabled:
        this.env[`SYMBOLWRIGHT_DISABLE_EGRESS_POLICY_${environmentKey(policy.policyId)}`] ===
        'true',
    }
  }
}

const REDIRECT_STATUS_CODES = new Set([301, 302, 303, 307, 308])

function validateCnameChain(chain: readonly string[], policy: EffectiveEgressPolicy): void {
  for (const hostname of chain) {
    if (!isHostAllowedByEgressPolicy(hostname, policy.allowedHosts)) {
      throw new EgressBrokerError(
        'EGRESS_DNS_CNAME_NOT_ALLOWED',
        `Egress CNAME target is outside the operator-owned allowlist: ${hostname}`,
      )
    }
  }
}

function uniqueAddresses(
  values: readonly EgressResolvedAddress[],
): readonly EgressResolvedAddress[] {
  const map = new Map<string, EgressResolvedAddress>()
  for (const value of values) map.set(`${value.family}:${value.address.toLowerCase()}`, value)
  return [...map.values()].sort((left, right) => {
    const family = left.family - right.family
    return family === 0 ? left.address.localeCompare(right.address) : family
  })
}

function stripSensitiveHeaders(
  headers: Readonly<Record<string, string>>,
): Readonly<Record<string, string>> {
  return Object.freeze(
    Object.fromEntries(
      Object.entries(headers).filter(
        ([name]) => name.toLowerCase() !== 'authorization' && name.toLowerCase() !== 'cookie',
      ),
    ),
  )
}

function sourceVersion(policy: EffectiveEgressPolicy, id: string): number {
  return policy.sources.find((source) => source.id === id)?.version ?? 0
}

function firstHeader(value: string | readonly string[] | undefined): string | undefined {
  if (typeof value === 'string') return value
  return value?.[0]
}

function normalizeHeaders(
  headers: Readonly<Record<string, string | string[] | undefined>>,
): Readonly<Record<string, string | readonly string[] | undefined>> {
  return Object.freeze(
    Object.fromEntries(
      Object.entries(headers).map(([key, value]) => [
        key.toLowerCase(),
        Array.isArray(value) ? Object.freeze([...value]) : value,
      ]),
    ),
  )
}

function toBytes(value: string | Uint8Array | undefined): Uint8Array {
  if (value === undefined) return new Uint8Array()
  return typeof value === 'string' ? Buffer.from(value, 'utf8') : value
}

function assertNotCancelled(signal: AbortSignal | undefined): void {
  if (signal?.aborted === true) {
    throw new EgressBrokerError('EGRESS_CANCELLED', 'Brokered egress request was cancelled.')
  }
}

function mapPolicyError<T>(operation: () => T): T {
  try {
    return operation()
  } catch (error) {
    throw mapToBrokerError(error)
  }
}

function mapToBrokerError(error: unknown): EgressBrokerError {
  if (error instanceof EgressBrokerError) return error
  if (error instanceof EgressPolicyError) return new EgressBrokerError(error.code, error.message)
  return new EgressBrokerError('EGRESS_INTERNAL_ERROR', errorMessage(error))
}

function environmentKey(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '_')
}

function positiveInteger(value: string | undefined, fallback: number): number {
  if (value === undefined || !/^[1-9]\d*$/.test(value)) return fallback
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) ? parsed : fallback
}

function isDnsNoData(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('code' in error)) return false
  const code = String((error as NodeJS.ErrnoException).code)
  return code === 'ENODATA' || code === 'ENOTFOUND' || code === 'ESERVFAIL'
}

async function ensureSafeAuditParent(directory: string): Promise<void> {
  await fs.mkdir(directory, { recursive: true, mode: 0o700 })
  const stat = await fs.lstat(directory)
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new EgressBrokerError(
      'EGRESS_AUDIT_PATH_UNSAFE',
      'Brokered egress audit parent must be a real directory.',
    )
  }
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
