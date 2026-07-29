import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

describe('sandbox network composition architecture', () => {
  it('constructs SandboxNetworkGateway only in the application runtime composition root', () => {
    const sourceRoot = path.resolve(process.cwd(), 'src')
    const constructors = sourceFiles(sourceRoot)
      .filter((file) => !file.endsWith('.spec.ts'))
      .filter((file) => readFileSync(file, 'utf8').includes('new SandboxNetworkGateway('))
      .map((file) => path.relative(process.cwd(), file).replaceAll(path.sep, '/'))

    expect(constructors).toEqual(['src/sandbox/sandbox-network-runtime.ts'])
  })

  it('composes the workspace runtime before server and MCP work begins', () => {
    const operationalBootstrap = readFileSync(
      path.resolve(process.cwd(), 'src/server/operational-bootstrap.ts'),
      'utf8',
    )
    const mcpCommand = readFileSync(path.resolve(process.cwd(), 'src/cli-mcp-server.ts'), 'utf8')

    expect(operationalBootstrap).toContain('getOrCreateApplicationSandboxNetworkRuntime')
    expect(operationalBootstrap).toContain("setCheck(\n    'sandbox_network_gateway'")
    expect(mcpCommand).toContain('getOrCreateApplicationSandboxNetworkRuntime')
    expect(mcpCommand.indexOf('getOrCreateApplicationSandboxNetworkRuntime')).toBeLessThan(
      mcpCommand.indexOf('runSymbolWrightMcpServer({'),
    )
  })

  it('does not weaken the strong-container network-none invariant', () => {
    const commandPlan = readFileSync(
      path.resolve(process.cwd(), 'src/sandbox/sandbox-container-command-plan.ts'),
      'utf8',
    )
    expect(commandPlan).toContain("'--network',\n      'none'")
  })
})

function sourceFiles(root: string): readonly string[] {
  const files: string[] = []
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const fullPath = path.join(root, entry.name)
    if (entry.isDirectory()) files.push(...sourceFiles(fullPath))
    if (entry.isFile() && entry.name.endsWith('.ts')) files.push(fullPath)
  }
  return files.sort()
}
