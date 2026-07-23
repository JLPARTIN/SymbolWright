import type { AutonomousMissionCoordinator } from './autonomous-mission-coordinator.js'
import type { AutonomousMissionReleaseService } from './autonomous-mission-release.js'

const RELEASE_SERVICES = new WeakMap<
  AutonomousMissionCoordinator,
  AutonomousMissionReleaseService
>()

export function registerAutonomousMissionReleaseService(
  coordinator: AutonomousMissionCoordinator,
  release: AutonomousMissionReleaseService,
): void {
  RELEASE_SERVICES.set(coordinator, release)
}

export function getAutonomousMissionReleaseService(
  coordinator: AutonomousMissionCoordinator,
): AutonomousMissionReleaseService | undefined {
  return RELEASE_SERVICES.get(coordinator)
}
