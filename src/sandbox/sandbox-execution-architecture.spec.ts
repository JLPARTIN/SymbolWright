import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

const SOURCE_ROOT = path.resolve('src')
const ALLOWED_DOCKER_CONSTRUCTION = new Set([
  path.normalize('src/sandbox/sandbox-command-backend.ts'),
  path.normalize('src/sandbox/sandbox-container-command-plan.ts'),
  path.normalize('src/sandbox/sandbox-container-backend.ts'),
  path.normalize('src/sandbox/sandbox-image-store.ts'),
])
const DIRECT_CONTAINER_MARKERS = [
  "'--cap-drop=ALL'",
  "'--security-opt=no-new-privileges:true'",
  "'--network'",
  "':/workspace:rw'",
]

function productionTypeScriptFiles(root: string): readonly string[] {
  const files: string[] = []
  for (const entry of readdirSync(root)) {
    const absolute = path.join(root, entry)
    if (statSync(absolute).isDirectory()) files.push(...productionTypeScriptFiles(absolute))
    else if (absolute.endsWith('.ts') && !absolute.endsWith('.spec.ts')) files.push(absolute)
  }
  return files
}

function repositoryPath(absolute: string): string {
  return path.normalize(path.relative(process.cwd(), absolute))
}

describe('sandbox execution architecture', () => {
  it('keeps runtime and portability runners as adapters without process creation', () => {
    const runtimeAdapter = readFileSync(
      path.join(SOURCE_ROOT, 'runtime/sandbox/sandbox-runner.ts'),
      'utf8',
    )
    const portableAdapter = readFileSync(
      path.join(SOURCE_ROOT, 'portability/portable-validation-runner.ts'),
      'utf8',
    )

    expect(runtimeAdapter).toContain("from '../../sandbox/sandbox-command-backend.js'")
    expect(runtimeAdapter).not.toContain("from 'node:child_process'")
    expect(portableAdapter).not.toContain("from 'node:child_process'")
    expect(portableAdapter).toContain('DockerSandboxRunner')
  })

  it('prohibits direct container isolation argument construction outside sandbox backends', () => {
    const violations: string[] = []
    for (const absolute of productionTypeScriptFiles(SOURCE_ROOT)) {
      const relative = repositoryPath(absolute)
      if (ALLOWED_DOCKER_CONSTRUCTION.has(relative)) continue
      const source = readFileSync(absolute, 'utf8')
      const matched = DIRECT_CONTAINER_MARKERS.filter((marker) => source.includes(marker))
      if (matched.length > 0) violations.push(`${relative}: ${matched.join(', ')}`)
    }

    expect(violations).toEqual([])
  })

  it('requires the compatibility backend to authorize through SandboxExecutionBroker', () => {
    const backend = readFileSync(
      path.join(SOURCE_ROOT, 'sandbox/sandbox-command-backend.ts'),
      'utf8',
    )
    const authorizationIndex = backend.indexOf('this.broker.authorizeCommand(')
    const asynchronousSpawnIndex = backend.indexOf('this.spawnProcess(')
    const synchronousSpawnIndex = backend.indexOf('this.spawnSyncProcess(')

    expect(authorizationIndex).toBeGreaterThan(-1)
    expect(asynchronousSpawnIndex).toBeGreaterThan(authorizationIndex)
    expect(synchronousSpawnIndex).toBeGreaterThan(authorizationIndex)
    expect(backend).not.toContain('execSync(')
    expect(backend).not.toContain('shell: true')
  })
})
