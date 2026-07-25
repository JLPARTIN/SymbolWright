import {
  appendFileSync,
  closeSync,
  copyFileSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import path from 'node:path'

import type {
  AgentAccessGrant,
  AgentSession,
  ApprovalRequest,
  AuditEvent,
  CredentialMetadata,
  DeviceAuthorization,
} from './access-types.js'

/** A stored credential verifier — the plaintext secret is never persisted, only its hash+salt. */
export interface StoredCredential {
  readonly id: string
  readonly grantId: string
  readonly saltHex: string
  readonly hashHex: string
  readonly metadata: CredentialMetadata
  readonly revoked: boolean
  readonly revokedAt?: string
}

const VALID_ID_PATTERN = /^[a-zA-Z0-9_-]{1,128}$/

function assertValidId(id: string, label: string): void {
  if (!VALID_ID_PATTERN.test(id)) {
    throw new Error(`Invalid ${label}: ${id}`)
  }
}

/** Atomic temp-file+rename JSON store, matching `MissionStore`'s durability pattern. */
class AtomicJsonDirectory<T> {
  public constructor(private readonly dir: string) {
    mkdirSync(this.dir, { recursive: true, mode: 0o700 })
  }

  public write(id: string, value: T): void {
    assertValidId(id, 'record id')
    const targetPath = this.pathFor(id)
    mkdirSync(this.dir, { recursive: true, mode: 0o700 })
    const tempPath = `${targetPath}.tmp-${process.pid}-${Math.random().toString(36).slice(2)}`
    const fd = openSync(tempPath, 'w', 0o600)
    try {
      writeFileSync(fd, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
      fsyncSync(fd)
    } finally {
      closeSync(fd)
    }
    if (existsSync(targetPath)) copyFileSync(targetPath, `${targetPath}.previous`)
    renameSync(tempPath, targetPath)
  }

  public read(id: string): T | undefined {
    assertValidId(id, 'record id')
    const targetPath = this.pathFor(id)
    if (!existsSync(targetPath)) return undefined
    try {
      return JSON.parse(readFileSync(targetPath, 'utf8')) as T
    } catch {
      const previousPath = `${targetPath}.previous`
      if (existsSync(previousPath)) {
        try {
          return JSON.parse(readFileSync(previousPath, 'utf8')) as T
        } catch {
          return undefined
        }
      }
      return undefined
    }
  }

  public list(): T[] {
    if (!existsSync(this.dir)) return []
    const entries: T[] = []
    for (const fileName of readdirSync(this.dir)) {
      if (!fileName.endsWith('.json')) continue
      const value = this.read(fileName.slice(0, -'.json'.length))
      if (value !== undefined) entries.push(value)
    }
    return entries
  }

  public remove(id: string): void {
    assertValidId(id, 'record id')
    const targetPath = this.pathFor(id)
    for (const candidate of [targetPath, `${targetPath}.previous`]) {
      if (existsSync(candidate)) rmSync(candidate, { force: true })
    }
  }

  private pathFor(id: string): string {
    return path.join(this.dir, `${id}.json`)
  }
}

export interface AccessStoreOptions {
  readonly workspaceRoot: string
}

export class AccessStore {
  private readonly root: string
  private readonly grants: AtomicJsonDirectory<AgentAccessGrant>
  private readonly credentials: AtomicJsonDirectory<StoredCredential>
  private readonly sessions: AtomicJsonDirectory<AgentSession>
  private readonly approvals: AtomicJsonDirectory<ApprovalRequest>
  private readonly deviceAuthorizations: AtomicJsonDirectory<DeviceAuthorization>
  private readonly auditLogPath: string

  public constructor(options: AccessStoreOptions) {
    this.root = path.join(path.resolve(options.workspaceRoot), '.symbolwright', 'access')
    this.grants = new AtomicJsonDirectory(path.join(this.root, 'grants'))
    this.credentials = new AtomicJsonDirectory(path.join(this.root, 'credentials'))
    this.sessions = new AtomicJsonDirectory(path.join(this.root, 'sessions'))
    this.approvals = new AtomicJsonDirectory(path.join(this.root, 'approvals'))
    this.deviceAuthorizations = new AtomicJsonDirectory(
      path.join(this.root, 'device-authorizations'),
    )
    this.auditLogPath = path.join(this.root, 'audit.jsonl')
    mkdirSync(this.root, { recursive: true, mode: 0o700 })
  }

  // -- Grants ---------------------------------------------------------
  public writeGrant(grant: AgentAccessGrant): void {
    this.grants.write(grant.id, grant)
  }
  public readGrant(id: string): AgentAccessGrant | undefined {
    return this.grants.read(id)
  }
  public listGrants(): readonly AgentAccessGrant[] {
    return this.grants.list().sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }
  public deleteGrant(id: string): void {
    this.grants.remove(id)
  }

  // -- Credentials ------------------------------------------------------
  public writeCredential(credential: StoredCredential): void {
    this.credentials.write(credential.id, credential)
  }
  public readCredential(id: string): StoredCredential | undefined {
    return this.credentials.read(id)
  }
  public listCredentialsForGrant(grantId: string): readonly StoredCredential[] {
    return this.credentials.list().filter((entry) => entry.grantId === grantId)
  }

  // -- Sessions ---------------------------------------------------------
  public writeSession(session: AgentSession): void {
    this.sessions.write(session.id, session)
  }
  public readSession(id: string): AgentSession | undefined {
    return this.sessions.read(id)
  }
  public listSessionsForGrant(grantId: string): readonly AgentSession[] {
    return this.sessions.list().filter((entry) => entry.grantId === grantId)
  }

  // -- Approvals ----------------------------------------------------------
  public writeApproval(approval: ApprovalRequest): void {
    this.approvals.write(approval.id, approval)
  }
  public readApproval(id: string): ApprovalRequest | undefined {
    return this.approvals.read(id)
  }
  public listApprovalsForGrant(grantId: string): readonly ApprovalRequest[] {
    return this.approvals.list().filter((entry) => entry.grantId === grantId)
  }

  // -- Device authorization ------------------------------------------------
  public writeDeviceAuthorization(record: DeviceAuthorization): void {
    this.deviceAuthorizations.write(record.deviceCode, record)
  }
  public readDeviceAuthorizationByDeviceCode(deviceCode: string): DeviceAuthorization | undefined {
    return this.deviceAuthorizations.read(deviceCode)
  }
  public findDeviceAuthorizationByUserCode(userCode: string): DeviceAuthorization | undefined {
    return this.deviceAuthorizations.list().find((entry) => entry.userCode === userCode)
  }
  public listPendingDeviceAuthorizations(): readonly DeviceAuthorization[] {
    return this.deviceAuthorizations.list().filter((entry) => entry.status === 'pending')
  }

  // -- Audit (append-only) --------------------------------------------------
  public appendAuditEvent(event: AuditEvent): void {
    mkdirSync(this.root, { recursive: true, mode: 0o700 })
    appendFileSync(this.auditLogPath, `${JSON.stringify(event)}\n`, {
      encoding: 'utf8',
      mode: 0o600,
    })
  }

  public listAuditEvents(
    filter: { readonly grantId?: string; readonly limit?: number } = {},
  ): readonly AuditEvent[] {
    if (!existsSync(this.auditLogPath)) return []
    const events: AuditEvent[] = []
    for (const line of readFileSync(this.auditLogPath, 'utf8').split('\n')) {
      if (line.trim().length === 0) continue
      try {
        const event = JSON.parse(line) as AuditEvent
        if (filter.grantId === undefined || event.grantId === filter.grantId) events.push(event)
      } catch {
        // A torn final line from a partial append is skipped; prior audit history remains readable.
      }
    }
    const limit = filter.limit ?? 500
    return events.slice(-limit).reverse()
  }
}
