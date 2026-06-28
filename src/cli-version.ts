import fs from 'node:fs'
import path from 'node:path'

import { CODEMIND_PLATFORM_NAME, CODEMIND_AJNA_CAPABILITY_NAME } from './codemind-foundation.js'
import {
  getCompletedRuntimeBuildPhaseCount,
  RUNTIME_BUILD_PHASES,
} from './runtime/runtime-build-state.js'

export const VERSION_BLOCK_ID = 'CODEMIND-VERSION-01' as const

export interface VersionInfo {
  readonly blockId: typeof VERSION_BLOCK_ID
  readonly platform: typeof CODEMIND_PLATFORM_NAME
  readonly capability: typeof CODEMIND_AJNA_CAPABILITY_NAME
  readonly version: string
  readonly nodeVersion: string
  readonly runtimePhases: string
  readonly buildTarget: string
}

export function getVersionInfo(workspaceRoot: string): VersionInfo {
  let version = 'unknown'
  try {
    const pkgPath = path.join(workspaceRoot, 'package.json')
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as { version?: string }
    if (typeof pkg.version === 'string') {
      version = pkg.version
    }
  } catch {
    // keep default
  }

  const completed = getCompletedRuntimeBuildPhaseCount()
  const total = RUNTIME_BUILD_PHASES.length

  return {
    blockId: VERSION_BLOCK_ID,
    platform: CODEMIND_PLATFORM_NAME,
    capability: CODEMIND_AJNA_CAPABILITY_NAME,
    version,
    nodeVersion: process.version,
    runtimePhases: `${completed}/${total}`,
    buildTarget: 'ES2022 / NodeNext',
  }
}

export function renderVersionInfo(info: VersionInfo): string {
  const lines = [
    `${info.platform} v${info.version}`,
    '',
    `Capability:     ${info.capability}`,
    `Node.js:        ${info.nodeVersion}`,
    `Runtime phases: ${info.runtimePhases}`,
    `Build target:   ${info.buildTarget}`,
  ]

  return lines.join('\n')
}

export function renderVersionCommand(workspaceRoot: string): string {
  const info = getVersionInfo(workspaceRoot)
  return renderVersionInfo(info)
}
