import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import type { EgressAuditRecord } from './egress-broker.js'
import { readEgressAuditRecords, rotateEgressAuditLogIfNeeded } from './egress-audit-retention.js'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })))
})

async function temporaryRoot(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'symbolwright-egress-audit-retention-'))
  roots.push(root)
  return root
}

function auditRecord(overrides: Partial<EgressAuditRecord> = {}): EgressAuditRecord {
  return {
    schemaVersion: 1,
    recordedAt: '2026-07-30T00:00:00.000Z',
    sessionIdHash: 'a'.repeat(64),
    policyId: 'docs-only',
    policyVersion: 1,
    policyFingerprint: 'b'.repeat(64),
    destinationHostname: 'docs.example.com',
    destinationPathHash: 'c'.repeat(64),
    method: 'GET',
    decision: 'allowed',
    decisionCode: 'EGRESS_REQUEST_ALLOWED',
    requestCount: 1,
    bytesSent: 10,
    bytesReceived: 20,
    durationMs: 5,
    resolvedAddressClass: 'public',
    ...overrides,
  }
}

describe('readEgressAuditRecords', () => {
  it('returns an empty result when the file does not exist', async () => {
    const filePath = path.join(await temporaryRoot(), 'audit.jsonl')
    await expect(readEgressAuditRecords(filePath)).resolves.toEqual({
      records: [],
      truncatedTailDropped: false,
      corruptLinesDropped: 0,
    })
  })

  it('parses every well-formed line', async () => {
    const filePath = path.join(await temporaryRoot(), 'audit.jsonl')
    const lines = [
      auditRecord({ sessionIdHash: 'a'.repeat(64) }),
      auditRecord({ sessionIdHash: 'd'.repeat(64) }),
    ]
    await fs.writeFile(filePath, lines.map((r) => JSON.stringify(r)).join('\n') + '\n', 'utf8')

    const result = await readEgressAuditRecords(filePath)

    expect(result.records).toHaveLength(2)
    expect(result.truncatedTailDropped).toBe(false)
    expect(result.corruptLinesDropped).toBe(0)
  })

  it('drops a torn trailing line from a process killed mid-append, keeping every complete record before it', async () => {
    const filePath = path.join(await temporaryRoot(), 'audit.jsonl')
    const complete = JSON.stringify(auditRecord())
    await fs.writeFile(
      filePath,
      `${complete}\n${complete}\n{"schemaVersion":1,"recordedAt":"2026`,
      'utf8',
    )

    const result = await readEgressAuditRecords(filePath)

    expect(result.records).toHaveLength(2)
    expect(result.truncatedTailDropped).toBe(true)
    expect(result.corruptLinesDropped).toBe(1)
  })

  it('drops a corrupt line anywhere in the file, not only the last one, without discarding the rest', async () => {
    const filePath = path.join(await temporaryRoot(), 'audit.jsonl')
    const complete = JSON.stringify(auditRecord())
    await fs.writeFile(filePath, `${complete}\nnot-json-in-the-middle\n${complete}\n`, 'utf8')

    const result = await readEgressAuditRecords(filePath)

    expect(result.records).toHaveLength(2)
    expect(result.truncatedTailDropped).toBe(false)
    expect(result.corruptLinesDropped).toBe(1)
  })

  it('drops a well-formed-JSON line missing required audit fields', async () => {
    const filePath = path.join(await temporaryRoot(), 'audit.jsonl')
    await fs.writeFile(filePath, `${JSON.stringify({ schemaVersion: 1 })}\n`, 'utf8')

    const result = await readEgressAuditRecords(filePath)

    expect(result.records).toHaveLength(0)
    expect(result.corruptLinesDropped).toBe(1)
  })
})

describe('rotateEgressAuditLogIfNeeded', () => {
  it('does nothing when the file does not exist', async () => {
    const filePath = path.join(await temporaryRoot(), 'audit.jsonl')
    await expect(rotateEgressAuditLogIfNeeded({ filePath })).resolves.toEqual({
      rotated: false,
      recordsKept: 0,
      recordsDroppedAsCorrupt: 0,
    })
  })

  it('does nothing while under both the size and age thresholds', async () => {
    const filePath = path.join(await temporaryRoot(), 'audit.jsonl')
    await fs.writeFile(filePath, `${JSON.stringify(auditRecord())}\n`, 'utf8')

    const result = await rotateEgressAuditLogIfNeeded({
      filePath,
      maxBytes: 1024 * 1024,
      maxAgeMs: 24 * 60 * 60 * 1000,
    })

    expect(result.rotated).toBe(false)
  })

  it('rotates once the size threshold is exceeded, archiving healed records to .1 and resetting the live file', async () => {
    const filePath = path.join(await temporaryRoot(), 'audit.jsonl')
    await fs.writeFile(filePath, `${JSON.stringify(auditRecord())}\n`, 'utf8')

    const result = await rotateEgressAuditLogIfNeeded({ filePath, maxBytes: 1 })

    expect(result).toEqual({ rotated: true, recordsKept: 1, recordsDroppedAsCorrupt: 0 })
    await expect(fs.readFile(filePath, 'utf8')).resolves.toBe('')
    const archived = await fs.readFile(`${filePath}.1`, 'utf8')
    expect(JSON.parse(archived.trim())).toMatchObject({ destinationHostname: 'docs.example.com' })
  })

  it('heals a corrupt trailing line into the archive rather than propagating it', async () => {
    const filePath = path.join(await temporaryRoot(), 'audit.jsonl')
    await fs.writeFile(filePath, `${JSON.stringify(auditRecord())}\ntorn-tail`, 'utf8')

    const result = await rotateEgressAuditLogIfNeeded({ filePath, maxBytes: 1 })

    expect(result).toEqual({ rotated: true, recordsKept: 1, recordsDroppedAsCorrupt: 1 })
  })

  it('rotates once the age threshold is exceeded, even under the size threshold', async () => {
    const filePath = path.join(await temporaryRoot(), 'audit.jsonl')
    await fs.writeFile(filePath, `${JSON.stringify(auditRecord())}\n`, 'utf8')

    const result = await rotateEgressAuditLogIfNeeded({
      filePath,
      maxBytes: 1024 * 1024,
      maxAgeMs: 1,
      now: () => new Date(Date.now() + 60 * 60 * 1000),
    })

    expect(result.rotated).toBe(true)
  })

  it('is idempotent -- rotating an already-empty live file a second time is a no-op', async () => {
    const filePath = path.join(await temporaryRoot(), 'audit.jsonl')
    await fs.writeFile(filePath, `${JSON.stringify(auditRecord())}\n`, 'utf8')
    await rotateEgressAuditLogIfNeeded({ filePath, maxBytes: 1 })

    const second = await rotateEgressAuditLogIfNeeded({ filePath, maxBytes: 1024 * 1024 })

    expect(second.rotated).toBe(false)
  })

  it('refuses to operate on a symlinked audit-log path', async () => {
    const root = await temporaryRoot()
    const real = path.join(root, 'real.jsonl')
    const link = path.join(root, 'audit.jsonl')
    await fs.writeFile(real, `${JSON.stringify(auditRecord())}\n`, 'utf8')
    await fs.symlink(real, link)

    await expect(rotateEgressAuditLogIfNeeded({ filePath: link, maxBytes: 1 })).rejects.toThrow(
      'symlink',
    )
  })
})
