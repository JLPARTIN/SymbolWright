import { randomUUID } from 'node:crypto'

import type { AccessGrantService, CreateGrantInput } from './access-grant-service.js'
import { generateDeviceCode, generateUserCode } from './access-credential.js'
import type { AccessStore } from './access-store.js'
import type { DeviceAuthorization, PrincipalType, RepositoryScope } from './access-types.js'

const DEFAULT_EXPIRY_SECONDS = 600
const DEFAULT_POLL_INTERVAL_SECONDS = 5
/** Plaintext tokens for approved device flows are held here only in-memory, only until the
 * agent's next poll picks them up (or they age out) — never written to disk. */
const PENDING_TOKEN_HANDOFF = new Map<
  string,
  { readonly token: string; readonly expiresAt: number }
>()
const HANDOFF_TTL_MS = 5 * 60_000

export class DeviceAuthorizationNotFoundError extends Error {}
export class DeviceAuthorizationStateError extends Error {}

export interface RequestDeviceAuthorizationInput {
  readonly principalType: PrincipalType
  readonly displayName: string
  readonly requestedProfileId: string
  readonly requestedRepositoryScope: RepositoryScope
  readonly clientId?: string
}

export interface DeviceAuthorizationResponse {
  readonly deviceCode: string
  readonly userCode: string
  readonly expiresInSeconds: number
  readonly pollIntervalSeconds: number
  readonly verificationUri: string
}

export type PollResult =
  | { readonly status: 'authorization_pending' }
  | { readonly status: 'slow_down' }
  | { readonly status: 'access_denied' }
  | { readonly status: 'expired_token' }
  | { readonly status: 'ok'; readonly token: string; readonly grantId: string }

export class DeviceAuthorizationService {
  public constructor(
    private readonly store: AccessStore,
    private readonly grantService: AccessGrantService,
    private readonly now: () => Date = () => new Date(),
  ) {}

  public requestDeviceAuthorization(
    input: RequestDeviceAuthorizationInput,
  ): DeviceAuthorizationResponse {
    const now = this.now()
    const record: DeviceAuthorization = {
      deviceCode: generateDeviceCode(),
      userCode: generateUserCode(),
      principalId: randomUUID(),
      principalType: input.principalType,
      displayName: input.displayName,
      requestedProfileId: input.requestedProfileId,
      requestedRepositoryScope: input.requestedRepositoryScope,
      ...(input.clientId === undefined ? {} : { clientId: input.clientId }),
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + DEFAULT_EXPIRY_SECONDS * 1000).toISOString(),
      pollIntervalSeconds: DEFAULT_POLL_INTERVAL_SECONDS,
      status: 'pending',
    }
    this.store.writeDeviceAuthorization(record)
    this.store.appendAuditEvent({
      id: randomUUID(),
      type: 'device_authorization.requested',
      timestamp: now.toISOString(),
      principalId: record.principalId,
      metadata: { userCode: record.userCode, profileId: input.requestedProfileId },
    })
    return {
      deviceCode: record.deviceCode,
      userCode: record.userCode,
      expiresInSeconds: DEFAULT_EXPIRY_SECONDS,
      pollIntervalSeconds: DEFAULT_POLL_INTERVAL_SECONDS,
      verificationUri: '/#/settings/agent-access/authorize',
    }
  }

  public listPending(): readonly DeviceAuthorization[] {
    const now = this.now().getTime()
    return this.store
      .listPendingDeviceAuthorizations()
      .filter((entry) => new Date(entry.expiresAt).getTime() > now)
  }

  public approve(
    userCode: string,
    actor: string,
    overrides: Partial<CreateGrantInput> = {},
  ): DeviceAuthorization {
    const record = this.requireByUserCode(userCode)
    this.assertPending(record)

    const { grant, plaintextToken } = this.grantService.createGrant({
      principalId: record.principalId,
      principalType: record.principalType,
      displayName: record.displayName,
      issuedBy: actor,
      profileId: record.requestedProfileId,
      repositoryScope: record.requestedRepositoryScope,
      ...overrides,
    })

    const now = this.now()
    const updated: DeviceAuthorization = {
      ...record,
      status: 'approved',
      grantId: grant.id,
      issuedTokenId: grant.id,
      decidedAt: now.toISOString(),
      decidedBy: actor,
    }
    this.store.writeDeviceAuthorization(updated)
    if (plaintextToken !== undefined) {
      PENDING_TOKEN_HANDOFF.set(record.deviceCode, {
        token: plaintextToken,
        expiresAt: now.getTime() + HANDOFF_TTL_MS,
      })
    }
    this.store.appendAuditEvent({
      id: randomUUID(),
      type: 'device_authorization.approved',
      timestamp: now.toISOString(),
      grantId: grant.id,
      principalId: grant.principalId,
      metadata: { actor },
    })
    return updated
  }

  public deny(userCode: string, actor: string): DeviceAuthorization {
    const record = this.requireByUserCode(userCode)
    this.assertPending(record)
    const now = this.now()
    const updated: DeviceAuthorization = {
      ...record,
      status: 'denied',
      decidedAt: now.toISOString(),
      decidedBy: actor,
    }
    this.store.writeDeviceAuthorization(updated)
    this.store.appendAuditEvent({
      id: randomUUID(),
      type: 'device_authorization.denied',
      timestamp: now.toISOString(),
      principalId: record.principalId,
      metadata: { actor },
    })
    return updated
  }

  public poll(deviceCode: string): PollResult {
    const record = this.store.readDeviceAuthorizationByDeviceCode(deviceCode)
    if (record === undefined) return { status: 'access_denied' }

    if (
      new Date(record.expiresAt).getTime() <= this.now().getTime() &&
      record.status === 'pending'
    ) {
      this.store.writeDeviceAuthorization({ ...record, status: 'expired' })
      return { status: 'expired_token' }
    }

    switch (record.status) {
      case 'pending':
        return { status: 'authorization_pending' }
      case 'denied':
      case 'expired':
        return { status: 'access_denied' }
      case 'consumed':
        return { status: 'access_denied' }
      case 'approved': {
        const handoff = PENDING_TOKEN_HANDOFF.get(deviceCode)
        if (handoff === undefined || handoff.expiresAt <= this.now().getTime()) {
          return { status: 'access_denied' }
        }
        PENDING_TOKEN_HANDOFF.delete(deviceCode)
        this.store.writeDeviceAuthorization({ ...record, status: 'consumed' })
        return { status: 'ok', token: handoff.token, grantId: record.grantId as string }
      }
    }
  }

  private requireByUserCode(userCode: string): DeviceAuthorization {
    const record = this.store.findDeviceAuthorizationByUserCode(userCode)
    if (record === undefined)
      throw new DeviceAuthorizationNotFoundError('No such device authorization request.')
    return record
  }

  private assertPending(record: DeviceAuthorization): void {
    if (record.status !== 'pending') {
      throw new DeviceAuthorizationStateError(`Device authorization is already ${record.status}.`)
    }
    if (new Date(record.expiresAt).getTime() <= this.now().getTime()) {
      throw new DeviceAuthorizationStateError('Device authorization request has expired.')
    }
  }
}
