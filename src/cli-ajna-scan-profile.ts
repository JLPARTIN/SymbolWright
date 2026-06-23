import type { AjnaRepoScanProfile } from './ajna/ajna-repo-scan-profile.js'
import {
  buildAjnaRepoScanProfile,
  renderAjnaRepoScanProfile,
} from './ajna/ajna-repo-scan-profile.js'
import { scanRepo } from './cli-scan.js'

export interface CodemindAjnaScanProfileCommandResult {
  readonly rootDir: string
  readonly profile: AjnaRepoScanProfile
  readonly output: string
}

export function buildAjnaScanProfileForRepo(rootDir: string): CodemindAjnaScanProfileCommandResult {
  const profile = buildAjnaRepoScanProfile(scanRepo(rootDir))

  return {
    rootDir,
    profile,
    output: renderAjnaRepoScanProfile(profile),
  }
}

export function renderAjnaScanProfileForRepo(rootDir: string): string {
  return buildAjnaScanProfileForRepo(rootDir).output
}
