import fs from 'node:fs'
import path from 'node:path'

import type { PackageManager } from './types.js'

const PACKAGE_MANAGER_LOCKFILES: Record<
  Exclude<PackageManager, 'unknown' | 'conflict'>,
  readonly string[]
> = {
  pnpm: ['pnpm-lock.yaml'],
  yarn: ['yarn.lock'],
  npm: ['package-lock.json', 'npm-shrinkwrap.json'],
}

export function detectPackageManager(repoRoot: string): PackageManager {
  const detected: PackageManager[] = []

  for (const [manager, lockfiles] of Object.entries(PACKAGE_MANAGER_LOCKFILES)) {
    if (lockfiles.some((lockfile) => fs.existsSync(path.join(repoRoot, lockfile)))) {
      detected.push(manager as PackageManager)
    }
  }

  if (detected.length === 0) {
    return 'unknown'
  }
  if (detected.length > 1) {
    return 'conflict'
  }
  return detected[0] ?? 'unknown'
}

export function renderPackageManagerCommand(manager: PackageManager, script: string): string {
  if (manager === 'npm') {
    return `npm run ${script}`
  }
  if (manager === 'pnpm') {
    return `pnpm run ${script}`
  }
  if (manager === 'yarn') {
    return `yarn run ${script}`
  }
  return `${manager} run ${script}`
}

export function packageManagerBinary(manager: PackageManager): string | null {
  if (manager === 'npm' || manager === 'pnpm' || manager === 'yarn') {
    return manager
  }
  return null
}
