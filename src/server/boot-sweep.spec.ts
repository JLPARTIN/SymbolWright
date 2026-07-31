import { createHash } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { MissionService } from '../mission/mission-service.js'
import { runBootSweep } from './boot-sweep.js'
import { ReadinessRegistry } from './readiness-registry.js'

const roots: string[] = []

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('runBootSweep', () => {
  it('does not materialize mission or retention index files in a pristine workspace', async () => {
    const workspaceRoot = mkdtempSync(path.join(tmpdir(), 'symbolwright-boot-sweep-'))
    roots.push(workspaceRoot)
    const missionService = new MissionService({ workspaceRoot, env: {} })
    const readiness = new ReadinessRegistry()

    const report = await runBootSweep({ workspaceRoot, missionService, readiness })

    expect(report.missionStoreHealthy).toBe(true)
    expect(report.retention).toEqual({ quarantined: 0, deleted: 0, restored: 0 })
    expect(report.sandboxNetwork).toEqual({
      brokenBindings: 0,
      orphanedTempDirsRemoved: 0,
      egressAuditRotated: false,
    })
    expect(existsSync(path.join(workspaceRoot, '.symbolwright', 'missions', 'index.json'))).toBe(
      false,
    )
    expect(existsSync(path.join(workspaceRoot, '.symbolwright', 'external-repos-quarantine'))).toBe(
      false,
    )
    expect(existsSync(path.join(workspaceRoot, '.symbolwright', 'sandbox-network'))).toBe(false)
  })

  it('recovers from a simulated hard crash: heals an orphaned staging directory, reports a dangling binding, and rotates a stale audit log -- all without deleting the binding record itself', async () => {
    const workspaceRoot = mkdtempSync(path.join(tmpdir(), 'symbolwright-boot-sweep-crash-'))
    roots.push(workspaceRoot)
    const sandboxNetworkRoot = path.join(workspaceRoot, '.symbolwright', 'sandbox-network')
    const longAgo = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000)

    // A binding record surviving on disk whose layer directory is gone (e.g. deleted out from
    // under it, or never fully materialized before a crash).
    const bindingsRoot = path.join(sandboxNetworkRoot, 'dependency-bindings')
    mkdirSync(bindingsRoot, { recursive: true })
    const workspaceIdSha256 = createHash('sha256').update('workspace-1', 'utf8').digest('hex')
    writeFileSync(
      path.join(bindingsRoot, `${workspaceIdSha256}.json`),
      JSON.stringify({
        schemaVersion: 1,
        workspaceIdSha256,
        boundAt: longAgo.toISOString(),
        layer: {
          schemaVersion: 1,
          layerId: 'layer-1',
          ecosystem: 'npm',
          rootPath: path.join(sandboxNetworkRoot, 'dependency-layers', 'layers', 'layer-1'),
          nodeModulesPath: path.join(
            sandboxNetworkRoot,
            'dependency-layers',
            'layers',
            'layer-1',
            'node_modules',
          ),
          manifestPath: path.join(
            sandboxNetworkRoot,
            'dependency-layers',
            'layers',
            'layer-1',
            '.symbolwright-dependency-layer.json',
          ),
          sbomPath: path.join(
            sandboxNetworkRoot,
            'dependency-layers',
            'layers',
            'layer-1',
            '.symbolwright-dependency-sbom.cdx.json',
          ),
          policyId: 'npm-controlled',
          policyVersion: 1,
          policyFingerprint: 'a'.repeat(64),
          packageJsonSha256: 'b'.repeat(64),
          packageLockSha256: 'c'.repeat(64),
          packageCount: 1,
          fileCount: 2,
          totalBytes: 32,
          manifestSha256: 'd'.repeat(64),
        },
      }),
      'utf8',
    )

    // An orphaned staging directory left behind by a materialization that never completed.
    const layersRoot = path.join(sandboxNetworkRoot, 'dependency-layers', 'layers')
    const orphan = path.join(layersRoot, '.layer-2-tmp-abandoned')
    mkdirSync(orphan, { recursive: true })
    utimesSync(orphan, longAgo, longAgo)

    // A stale egress audit log well past the age-based retention threshold.
    const auditDir = path.join(sandboxNetworkRoot, 'egress')
    mkdirSync(auditDir, { recursive: true })
    const auditPath = path.join(auditDir, 'sandbox-egress-audit.jsonl')
    writeFileSync(
      auditPath,
      `${JSON.stringify({
        schemaVersion: 1,
        recordedAt: longAgo.toISOString(),
        sessionIdHash: 'e'.repeat(64),
        policyId: 'docs-only',
        policyVersion: 1,
        policyFingerprint: 'f'.repeat(64),
        destinationHostname: 'docs.example.com',
        destinationPathHash: 'g'.repeat(64),
        method: 'GET',
        decision: 'allowed',
        decisionCode: 'EGRESS_REQUEST_ALLOWED',
        requestCount: 1,
        bytesSent: 1,
        bytesReceived: 1,
        durationMs: 1,
        resolvedAddressClass: 'public',
      })}\n`,
      'utf8',
    )
    utimesSync(auditPath, longAgo, longAgo)

    const missionService = new MissionService({ workspaceRoot, env: {} })
    const readiness = new ReadinessRegistry()

    const report = await runBootSweep({ workspaceRoot, missionService, readiness })

    expect(report.sandboxNetwork).toEqual({
      brokenBindings: 1,
      orphanedTempDirsRemoved: 1,
      egressAuditRotated: true,
    })
    expect(report.warnings.some((warning) => warning.includes('missing-layer'))).toBe(true)
    expect(readiness.detailedSnapshot().checks['sandbox_network_reconciliation']).toMatchObject({
      ready: true,
    })

    // The orphan is gone, but the binding record itself was never touched -- reconciliation
    // reports, it never mutates or reconstructs authority.
    expect(existsSync(orphan)).toBe(false)
    expect(existsSync(path.join(bindingsRoot, `${workspaceIdSha256}.json`))).toBe(true)

    // The audit log was rotated: the live file is reset and the prior record survives in .1.
    expect(readFileSync(auditPath, 'utf8')).toBe('')
    const archived = readFileSync(`${auditPath}.1`, 'utf8')
    expect(JSON.parse(archived.trim())).toMatchObject({ destinationHostname: 'docs.example.com' })

    // Idempotent: a second sweep over the now-reconciled state finds nothing further to do.
    const second = await runBootSweep({
      workspaceRoot,
      missionService,
      readiness: new ReadinessRegistry(),
    })
    expect(second.sandboxNetwork).toEqual({
      brokenBindings: 1,
      orphanedTempDirsRemoved: 0,
      egressAuditRotated: false,
    })
  })
})
