import { createHash, randomUUID } from 'node:crypto'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { DependencyArtifactCache, type DependencyCacheEntry } from './dependency-artifact-cache.js'
import { DependencyHttpsFetcher, type DependencyFetchResult } from './dependency-https-fetcher.js'
import {
  resolveEffectiveDependencyPolicy,
  type DependencyPolicyCatalog,
  type DependencyPolicyRequest,
  type EffectiveDependencyPolicy,
} from './dependency-policy.js'
import type { SandboxAuthorizationContext } from './sandbox-policy-model.js'
import { ensureSecureStateDirectory } from './secure-state-directory.js'
import {
  createNpmDependencyPlan,
  type NpmDependencyArtifact,
  type NpmDependencyPlan,
} from './npm-dependency-plan.js'
import { inspectNpmTarball, type NpmTarballInspection } from './npm-tarball-inspector.js'

export const DEPENDENCY_ACQUISITION_REPORT_SCHEMA_VERSION = 1 as const

export type DependencyAcquisitionStatus = 'completed' | 'blocked' | 'failed' | 'cancelled'

export interface DependencyAcquisitionArtifactEvidence {
  readonly packageName: string
  readonly packageVersion: string
  readonly cacheKey: string
  readonly cacheHit: boolean
  readonly archiveBytes: number
  readonly expandedBytes: number
  readonly fileCount: number
  readonly requestCount: number
  readonly finalUrlSha256: string
  readonly resolvedAddressSha256?: string
}

export interface DependencyAcquisitionReport {
  readonly schemaVersion: typeof DEPENDENCY_ACQUISITION_REPORT_SCHEMA_VERSION
  readonly acquisitionId: string
  readonly status: DependencyAcquisitionStatus
  readonly ecosystem: 'npm'
  readonly startedAt: string
  readonly completedAt: string
  readonly durationMs: number
  readonly decisionCode: string
  readonly reason: string
  readonly policy?: {
    readonly id: string
    readonly version: number
    readonly fingerprint: string
  }
  readonly packageJsonSha256?: string
  readonly packageLockSha256?: string
  readonly packageCount: number
  readonly cacheHits: number
  readonly networkRequests: number
  readonly archiveBytes: number
  readonly expandedBytes: number
  readonly fileCount: number
  readonly artifacts: readonly DependencyAcquisitionArtifactEvidence[]
  readonly sbom?: NpmDependencyPlan['sbom']
  readonly evidenceSha256: string
}

export interface AcquiredNpmDependencyArtifact {
  readonly artifact: NpmDependencyArtifact
  readonly cacheEntry: DependencyCacheEntry
  readonly inspection: NpmTarballInspection
}

export interface DependencyAcquisitionSession {
  readonly report: DependencyAcquisitionReport
  readonly plan?: NpmDependencyPlan
  readonly policy?: EffectiveDependencyPolicy
  readonly acquiredArtifacts: readonly AcquiredNpmDependencyArtifact[]
  readonly evidencePath?: string
}

export interface DependencyPolicyRevisionSnapshot {
  readonly globalVersion: number
  readonly policyVersion: number
  readonly emergencyDisabled: boolean
}

export interface DependencyPolicyRevisionSource {
  readonly read: (policy: EffectiveDependencyPolicy) => DependencyPolicyRevisionSnapshot
}

export interface DependencyAcquisitionReportSink {
  readonly persist: (report: DependencyAcquisitionReport) => Promise<string>
}

export class EnvironmentDependencyPolicyRevisionSource
  implements DependencyPolicyRevisionSource
{
  public constructor(private readonly env: NodeJS.ProcessEnv) {}

  public read(policy: EffectiveDependencyPolicy): DependencyPolicyRevisionSnapshot {
    return {
      globalVersion: positiveInteger(
        this.env['SYMBOLWRIGHT_DEPENDENCY_GLOBAL_POLICY_VERSION'],
        sourceVersion(policy, 'dependency-global'),
      ),
      policyVersion: positiveInteger(
        this.env[`SYMBOLWRIGHT_DEPENDENCY_POLICY_VERSION_${environmentKey(policy.policyId)}`],
        policy.policyVersion,
      ),
      emergencyDisabled:
        this.env['SYMBOLWRIGHT_DISABLE_DEPENDENCY_ACQUISITION'] === 'true' ||
        this.env[
          `SYMBOLWRIGHT_DISABLE_DEPENDENCY_POLICY_${environmentKey(policy.policyId)}`
        ] === 'true',
    }
  }
}

export interface DependencyAcquisitionServiceOptions {
  readonly catalog: DependencyPolicyCatalog
  readonly cache?: DependencyArtifactCache
  readonly fetcher?: DependencyHttpsFetcher
  readonly env?: NodeJS.ProcessEnv
  readonly revisionSource?: DependencyPolicyRevisionSource
  readonly reportSink?: DependencyAcquisitionReportSink
  readonly stateRoot?: string
  readonly now?: () => Date
  readonly generateAcquisitionId?: () => string
}

/**
 * Coordinates policy resolution, immutable npm planning, bounded HTTPS fetches, archive inspection,
 * cache admission, and redacted durable evidence. It never executes package lifecycle scripts.
 */
export class DependencyAcquisitionService {
  private readonly catalog: DependencyPolicyCatalog
  private readonly cache: DependencyArtifactCache
  private readonly fetcher: DependencyHttpsFetcher
  private readonly env: NodeJS.ProcessEnv
  private readonly revisionSource: DependencyPolicyRevisionSource
  private readonly reportSink: DependencyAcquisitionReportSink
  private readonly stateRoot: string
  private readonly now: () => Date
  private readonly generateAcquisitionId: () => string

  public constructor(options: DependencyAcquisitionServiceOptions) {
    this.catalog = options.catalog
    this.stateRoot = path.resolve(
      options.stateRoot ?? path.join(os.tmpdir(), 'symbolwright-dependency-acquisition'),
    )
    this.cache =
      options.cache ?? new DependencyArtifactCache({ root: path.join(this.stateRoot, 'cache') })
    this.fetcher = options.fetcher ?? new DependencyHttpsFetcher()
    this.env = options.env ?? process.env
    this.revisionSource =
      options.revisionSource ?? new EnvironmentDependencyPolicyRevisionSource(this.env)
    this.reportSink = options.reportSink ?? { persist: (report) => this.persistReport(report) }
    this.now = options.now ?? (() => new Date())
    this.generateAcquisitionId =
      options.generateAcquisitionId ?? (() => `dependency_${randomUUID()}`)
  }

  public async acquireNpm(input: {
    readonly packageJsonText: string
    readonly packageLockText: string
    readonly authorization: SandboxAuthorizationContext
    readonly request?: Omit<DependencyPolicyRequest, 'ecosystem'>
    readonly signal?: AbortSignal
  }): Promise<DependencyAcquisitionSession> {
    const acquisitionId = this.generateAcquisitionId()
    const startedAt = this.now().toISOString()
    const started = Date.parse(startedAt)
    const policyDecision = resolveEffectiveDependencyPolicy({
      request: { ecosystem: 'npm', ...(input.request ?? {}) },
      authorization: input.authorization,
      catalog: this.catalog,
      env: this.env,
      now: this.now,
    })
    if (!policyDecision.allowed || policyDecision.policy === undefined) {
      return this.finalize({
        acquisitionId,
        status: 'blocked',
        startedAt,
        started,
        decisionCode: policyDecision.reasonCode,
        reason: policyDecision.reason,
        artifacts: [],
      })
    }

    const policy = policyDecision.policy
    this.assertPolicyCurrent(policy)
    let plan: NpmDependencyPlan
    try {
      plan = createNpmDependencyPlan({
        packageJsonText: input.packageJsonText,
        packageLockText: input.packageLockText,
        policy,
      })
    } catch (error) {
      return this.finalize({
        acquisitionId,
        status: 'failed',
        startedAt,
        started,
        decisionCode: errorCode(error, 'DEPENDENCY_PLAN_FAILED'),
        reason: safeReason(error),
        policy,
        artifacts: [],
      })
    }

    const acquired: AcquiredNpmDependencyArtifact[] = []
    const evidence: DependencyAcquisitionArtifactEvidence[] = []
    let nextIndex = 0
    let terminalError: unknown
    const workerCount = Math.min(policy.limits.maxConcurrency, Math.max(1, plan.artifacts.length))

    const worker = async (): Promise<void> => {
      for (;;) {
        if (terminalError !== undefined) return
        assertNotCancelled(input.signal)
        this.assertPolicyCurrent(policy)
        const index = nextIndex
        nextIndex += 1
        const artifact = plan.artifacts[index]
        if (artifact === undefined) return
        try {
          const item = await this.acquireArtifact({
            artifact,
            policy,
            ...(input.signal === undefined ? {} : { signal: input.signal }),
          })
          acquired[index] = item.acquired
          evidence[index] = item.evidence
        } catch (error) {
          terminalError = error
          return
        }
      }
    }

    try {
      await Promise.all(Array.from({ length: workerCount }, worker))
      if (terminalError !== undefined) throw terminalError
      const compactAcquired = acquired.filter(
        (entry): entry is AcquiredNpmDependencyArtifact => entry !== undefined,
      )
      const compactEvidence = evidence.filter(
        (entry): entry is DependencyAcquisitionArtifactEvidence => entry !== undefined,
      )
      const totals = sumEvidence(compactEvidence)
      if (totals.networkRequests > policy.limits.maxRequests) {
        throw codedError(
          'DEPENDENCY_REQUEST_QUOTA_EXCEEDED',
          `Dependency acquisition used ${totals.networkRequests} requests; policy allows ${policy.limits.maxRequests}.`,
        )
      }
      if (totals.archiveBytes > policy.limits.maxTotalBytes) {
        throw codedError(
          'DEPENDENCY_ARCHIVE_TOTAL_QUOTA_EXCEEDED',
          `Dependency archives total ${totals.archiveBytes} bytes; policy allows ${policy.limits.maxTotalBytes}.`,
        )
      }
      if (totals.expandedBytes > policy.limits.maxTotalBytes) {
        throw codedError(
          'DEPENDENCY_EXPANDED_TOTAL_QUOTA_EXCEEDED',
          `Expanded dependencies total ${totals.expandedBytes} bytes; policy allows ${policy.limits.maxTotalBytes}.`,
        )
      }
      return this.finalize({
        acquisitionId,
        status: 'completed',
        startedAt,
        started,
        decisionCode: 'DEPENDENCY_ACQUISITION_COMPLETED',
        reason: `Acquired ${compactAcquired.length} immutable npm dependency artifacts with lifecycle scripts suppressed.`,
        policy,
        plan,
        artifacts: compactEvidence,
        acquiredArtifacts: compactAcquired,
      })
    } catch (error) {
      const cancelled = isCancellation(error) || input.signal?.aborted === true
      return this.finalize({
        acquisitionId,
        status: cancelled ? 'cancelled' : 'failed',
        startedAt,
        started,
        decisionCode: cancelled
          ? 'DEPENDENCY_ACQUISITION_CANCELLED'
          : errorCode(error, 'DEPENDENCY_ACQUISITION_FAILED'),
        reason: cancelled ? 'Dependency acquisition cancelled.' : safeReason(error),
        policy,
        plan,
        artifacts: evidence.filter(
          (entry): entry is DependencyAcquisitionArtifactEvidence => entry !== undefined,
        ),
        acquiredArtifacts: acquired.filter(
          (entry): entry is AcquiredNpmDependencyArtifact => entry !== undefined,
        ),
      })
    }
  }

  private async acquireArtifact(input: {
    readonly artifact: NpmDependencyArtifact
    readonly policy: EffectiveDependencyPolicy
    readonly signal?: AbortSignal
  }): Promise<{
    readonly acquired: AcquiredNpmDependencyArtifact
    readonly evidence: DependencyAcquisitionArtifactEvidence
  }> {
    assertNotCancelled(input.signal)
    this.assertPolicyCurrent(input.policy)
    let cacheEntry = await this.cache.getNpmArtifact({
      artifact: input.artifact,
      policy: input.policy,
    })
    let bytes: Uint8Array
    let fetchResult: DependencyFetchResult | undefined
    if (cacheEntry === undefined) {
      fetchResult = await this.fetcher.fetch({
        url: input.artifact.resolvedUrl,
        policy: input.policy,
        checkpoint: () => this.assertPolicyCurrent(input.policy),
        ...(input.signal === undefined ? {} : { signal: input.signal }),
      })
      bytes = fetchResult.bytes
    } else {
      bytes = await fs.readFile(cacheEntry.artifactPath)
    }

    assertNotCancelled(input.signal)
    this.assertPolicyCurrent(input.policy)
    const inspection = inspectNpmTarball(bytes, input.policy.limits)
    if (cacheEntry === undefined) {
      this.assertPolicyCurrent(input.policy)
      cacheEntry = await this.cache.putNpmArtifact({
        artifact: input.artifact,
        bytes,
        policy: input.policy,
      })
    }
    const finalUrl = fetchResult?.finalUrl ?? input.artifact.resolvedUrl
    return {
      acquired: { artifact: input.artifact, cacheEntry, inspection },
      evidence: {
        packageName: input.artifact.name,
        packageVersion: input.artifact.version,
        cacheKey: input.artifact.cacheKey,
        cacheHit: fetchResult === undefined,
        archiveBytes: bytes.byteLength,
        expandedBytes: inspection.expandedBytes,
        fileCount: inspection.fileCount,
        requestCount: fetchResult?.requestCount ?? 0,
        finalUrlSha256: sha256(finalUrl),
        ...(fetchResult?.resolvedAddressSha256 === undefined
          ? {}
          : { resolvedAddressSha256: fetchResult.resolvedAddressSha256 }),
      },
    }
  }

  private async finalize(input: {
    readonly acquisitionId: string
    readonly status: DependencyAcquisitionStatus
    readonly startedAt: string
    readonly started: number
    readonly decisionCode: string
    readonly reason: string
    readonly policy?: EffectiveDependencyPolicy
    readonly plan?: NpmDependencyPlan
    readonly artifacts: readonly DependencyAcquisitionArtifactEvidence[]
    readonly acquiredArtifacts?: readonly AcquiredNpmDependencyArtifact[]
  }): Promise<DependencyAcquisitionSession> {
    const completedAt = this.now().toISOString()
    const totals = sumEvidence(input.artifacts)
    const material = {
      schemaVersion: DEPENDENCY_ACQUISITION_REPORT_SCHEMA_VERSION,
      acquisitionId: input.acquisitionId,
      status: input.status,
      ecosystem: 'npm' as const,
      startedAt: input.startedAt,
      completedAt,
      durationMs: Math.max(0, Date.parse(completedAt) - input.started),
      decisionCode: input.decisionCode,
      reason: input.reason,
      ...(input.policy === undefined
        ? {}
        : {
            policy: {
              id: input.policy.policyId,
              version: input.policy.policyVersion,
              fingerprint: input.policy.fingerprint,
            },
          }),
      ...(input.plan === undefined
        ? {}
        : {
            packageJsonSha256: input.plan.packageJsonSha256,
            packageLockSha256: input.plan.packageLockSha256,
            sbom: input.plan.sbom,
          }),
      packageCount: input.artifacts.length,
      cacheHits: input.artifacts.filter((entry) => entry.cacheHit).length,
      networkRequests: totals.networkRequests,
      archiveBytes: totals.archiveBytes,
      expandedBytes: totals.expandedBytes,
      fileCount: totals.fileCount,
      artifacts: Object.freeze([...input.artifacts]),
    }
    const report: DependencyAcquisitionReport = Object.freeze({
      ...material,
      evidenceSha256: sha256(stableJson(material)),
    })
    let evidencePath: string
    try {
      evidencePath = await this.reportSink.persist(report)
    } catch {
      throw codedError(
        'DEPENDENCY_EVIDENCE_WRITE_FAILED',
        'Dependency acquisition evidence could not be durably persisted.',
      )
    }
    return {
      report,
      ...(input.plan === undefined ? {} : { plan: input.plan }),
      ...(input.policy === undefined ? {} : { policy: input.policy }),
      acquiredArtifacts: Object.freeze([...(input.acquiredArtifacts ?? [])]),
      evidencePath,
    }
  }

  private assertPolicyCurrent(policy: EffectiveDependencyPolicy): void {
    const current = this.revisionSource.read(policy)
    if (
      current.emergencyDisabled ||
      current.globalVersion !== sourceVersion(policy, 'dependency-global') ||
      current.policyVersion !== policy.policyVersion
    ) {
      throw codedError(
        'DEPENDENCY_POLICY_REVOKED',
        'The operator-owned dependency policy changed or was revoked while acquisition was active.',
      )
    }
  }

  private async persistReport(report: DependencyAcquisitionReport): Promise<string> {
    const evidenceRoot = path.join(this.stateRoot, 'evidence')
    await ensureSecureStateDirectory(evidenceRoot)
    const safeId = report.acquisitionId.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 128)
    const finalPath = path.join(evidenceRoot, `${safeId}.json`)
    const tempPath = `${finalPath}.tmp-${process.pid}-${Date.now().toString(36)}`
    await fs.writeFile(tempPath, `${JSON.stringify(report, null, 2)}\n`, {
      encoding: 'utf8',
      mode: 0o600,
      flag: 'wx',
    })
    await fs.rename(tempPath, finalPath)
    return finalPath
  }
}

function sumEvidence(artifacts: readonly DependencyAcquisitionArtifactEvidence[]): {
  readonly networkRequests: number
  readonly archiveBytes: number
  readonly expandedBytes: number
  readonly fileCount: number
} {
  return artifacts.reduce(
    (total, entry) => ({
      networkRequests: total.networkRequests + entry.requestCount,
      archiveBytes: total.archiveBytes + entry.archiveBytes,
      expandedBytes: total.expandedBytes + entry.expandedBytes,
      fileCount: total.fileCount + entry.fileCount,
    }),
    { networkRequests: 0, archiveBytes: 0, expandedBytes: 0, fileCount: 0 },
  )
}

function assertNotCancelled(signal: AbortSignal | undefined): void {
  if (signal?.aborted === true) throw codedError('DEPENDENCY_FETCH_CANCELLED', 'Cancelled.')
}

function isCancellation(error: unknown): boolean {
  return errorCode(error, '') === 'DEPENDENCY_FETCH_CANCELLED'
}

function codedError(code: string, message: string): Error & { readonly code: string } {
  return Object.assign(new Error(message), { code })
}

function errorCode(error: unknown, fallback: string): string {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const value = (error as { readonly code?: unknown }).code
    if (typeof value === 'string' && value.length > 0) return value
  }
  return fallback
}

function safeReason(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  const normalized = message.replace(/[\r\n\t]+/g, ' ').trim()
  return normalized.length <= 500 ? normalized : `${normalized.slice(0, 500)}…`
}

function sourceVersion(policy: EffectiveDependencyPolicy, id: string): number {
  return policy.sources.find((source) => source.id === id)?.version ?? 0
}

function environmentKey(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '_')
}

function positiveInteger(value: string | undefined, fallback: number): number {
  if (value === undefined || !/^[1-9]\d*$/.test(value)) return fallback
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) ? parsed : fallback
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (typeof value === 'object' && value !== null) {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}
