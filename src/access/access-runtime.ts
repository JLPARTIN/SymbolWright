import { AccessGrantService } from './access-grant-service.js'
import { AccessStore } from './access-store.js'
import { AuthorizationService } from './authorization-service.js'
import { DeviceAuthorizationService } from './device-authorization-service.js'

export interface AccessRuntimeOptions {
  readonly workspaceRoot: string
}

const liveRuntimes: WeakRef<AccessRuntime>[] = []

/** Bundles the delegated-agent-access subsystem's services for a given workspace, constructed
 * once per server process (mirrors `MissionService`/`SandboxService` construction). */
export class AccessRuntime {
  public readonly store: AccessStore
  public readonly authorizationService: AuthorizationService
  public readonly grantService: AccessGrantService
  public readonly deviceAuthorizationService: DeviceAuthorizationService

  public constructor(options: AccessRuntimeOptions) {
    this.store = new AccessStore({ workspaceRoot: options.workspaceRoot })
    this.authorizationService = new AuthorizationService(this.store)
    this.grantService = new AccessGrantService(this.store)
    this.deviceAuthorizationService = new DeviceAuthorizationService(this.store, this.grantService)
    liveRuntimes.unshift(new WeakRef(this))
  }
}

/**
 * Returns the most recently composed in-process access runtime that owns the authenticated grant.
 * Mission workspaces can live outside the server root, so reopening access state from a tool cwd
 * would create a second, empty authority store. Dead weak references are compacted opportunistically.
 */
export function findLiveAccessRuntimeForGrant(
  principalId: string,
  grantId: string,
): AccessRuntime | undefined {
  let writeIndex = 0
  let match: AccessRuntime | undefined
  for (const reference of liveRuntimes) {
    const runtime = reference.deref()
    if (runtime === undefined) continue
    liveRuntimes[writeIndex] = reference
    writeIndex += 1
    if (match !== undefined) continue
    const grant = runtime.grantService.getGrant(grantId)
    if (grant?.principalId === principalId) match = runtime
  }
  liveRuntimes.length = writeIndex
  return match
}
