import { AccessGrantService } from './access-grant-service.js'
import { AccessStore } from './access-store.js'
import { AuthorizationService } from './authorization-service.js'
import { DeviceAuthorizationService } from './device-authorization-service.js'

export interface AccessRuntimeOptions {
  readonly workspaceRoot: string
}

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
  }
}
