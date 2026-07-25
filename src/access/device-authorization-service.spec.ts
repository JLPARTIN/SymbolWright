import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { AccessGrantService, InvalidCredentialError } from './access-grant-service.js'
import { AccessStore } from './access-store.js'
import {
  DeviceAuthorizationNotFoundError,
  DeviceAuthorizationService,
  DeviceAuthorizationStateError,
} from './device-authorization-service.js'
import type { RepositoryScope } from './access-types.js'

const REPO_SCOPE: RepositoryScope = {
  mode: 'single',
  repositories: ['JLPARTIN/SymbolWright'],
  organizations: [],
}

describe('DeviceAuthorizationService', () => {
  let root: string
  let store: AccessStore
  let grants: AccessGrantService
  let device: DeviceAuthorizationService

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'symbolwright-device-auth-'))
    store = new AccessStore({ workspaceRoot: root })
    grants = new AccessGrantService(store)
    device = new DeviceAuthorizationService(store, grants)
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  it('runs the full request -> approve -> poll -> token cycle for a terminal agent', () => {
    const request = device.requestDeviceAuthorization({
      principalType: 'coding-agent',
      displayName: 'Claude Code (terminal)',
      requestedProfileId: 'coding-agent',
      requestedRepositoryScope: REPO_SCOPE,
    })
    expect(request.userCode).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/)

    expect(device.poll(request.deviceCode)).toEqual({ status: 'authorization_pending' })

    const approved = device.approve(request.userCode, 'operator-1')
    expect(approved.status).toBe('approved')
    expect(approved.grantId).toBeDefined()

    const polled = device.poll(request.deviceCode)
    expect(polled.status).toBe('ok')
    if (polled.status !== 'ok') throw new Error('expected ok')
    expect(polled.token.startsWith('sw_agent_')).toBe(true)

    const authenticated = grants.authenticateAgentToken(polled.token)
    expect(authenticated.grant.id).toBe(approved.grantId)

    // The token can only be handed off once — a second poll after delivery must not repeat it.
    expect(device.poll(request.deviceCode)).toEqual({ status: 'access_denied' })
  })

  it('denies the device flow when the operator denies it', () => {
    const request = device.requestDeviceAuthorization({
      principalType: 'llm',
      displayName: 'Unknown agent',
      requestedProfileId: 'coding-agent',
      requestedRepositoryScope: REPO_SCOPE,
    })
    device.deny(request.userCode, 'operator-1')
    expect(device.poll(request.deviceCode)).toEqual({ status: 'access_denied' })
    expect(() => device.deny(request.userCode, 'operator-1')).toThrow(DeviceAuthorizationStateError)
  })

  it('rejects approving an unknown user code', () => {
    expect(() => device.approve('ZZZZ-ZZZZ', 'operator-1')).toThrow(
      DeviceAuthorizationNotFoundError,
    )
  })

  it('rejects an unknown device code at poll time', () => {
    expect(device.poll('not-a-real-device-code')).toEqual({ status: 'access_denied' })
  })

  it('does not let an unapproved device code produce a working credential', () => {
    const request = device.requestDeviceAuthorization({
      principalType: 'automation',
      displayName: 'Pending agent',
      requestedProfileId: 'coding-agent',
      requestedRepositoryScope: REPO_SCOPE,
    })
    const result = device.poll(request.deviceCode)
    expect(result.status).toBe('authorization_pending')
    expect(() => grants.authenticateAgentToken('sw_agent_fake.fake')).toThrow(
      InvalidCredentialError,
    )
  })
})
