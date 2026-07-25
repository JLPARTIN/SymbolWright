import fs from 'node:fs'
import path from 'node:path'

import type { DoctorCheck } from '../cli-doctor.js'
import { SWARM_AGENT_TYPES } from '../hivemind/hivemind.types.js'
import { HiveMindRegistry } from '../hivemind/hivemind-registry.js'

export function checkProviderConfig(): DoctorCheck {
  const apiKey = process.env['ANTHROPIC_API_KEY']
  if (apiKey !== undefined && apiKey.length > 0) {
    const redacted = `${apiKey.substring(0, 6)}...${apiKey.substring(apiKey.length - 4)}`
    return { name: 'Provider API key', status: 'PASS', detail: `Configured (${redacted})` }
  }

  const configPaths = [
    path.join(process.env['HOME'] ?? '', '.symbolwright', 'config.json'),
    path.join(process.cwd(), '.symbolwright', 'config.json'),
  ]

  for (const configPath of configPaths) {
    if (fs.existsSync(configPath)) {
      try {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8')) as Record<string, unknown>
        if (typeof config['apiKey'] === 'string' && config['apiKey'].length > 0) {
          return {
            name: 'Provider API key',
            status: 'PASS',
            detail: `Configured via ${configPath}`,
          }
        }
      } catch {
        // config file exists but is malformed
      }
    }
  }

  return {
    name: 'Provider API key',
    status: 'WARN',
    detail: 'No ANTHROPIC_API_KEY set and no config file found',
  }
}

export function checkHiveMindRegistry(): DoctorCheck {
  const registry = new HiveMindRegistry()
  const types = registry.listAgentTypes()
  const expected = SWARM_AGENT_TYPES.length

  if (types.length === expected) {
    return {
      name: 'HiveMind registry',
      status: 'PASS',
      detail: `${types.length}/${expected} agent types loaded`,
    }
  }
  return {
    name: 'HiveMind registry',
    status: 'FAIL',
    detail: `${types.length}/${expected} agent types loaded`,
  }
}

export function checkAjnaPipeline(): DoctorCheck {
  const ajnaFiles = [
    'src/ajna/ajna-risk-synthesis.ts',
    'src/ajna/ajna-merge-decision.ts',
    'src/ajna/ajna-review-pipeline.ts',
    'src/ajna/ajna-live-review.ts',
  ]

  const cwd = process.cwd()
  const existing = ajnaFiles.filter((f) => fs.existsSync(path.join(cwd, f)))

  if (existing.length === ajnaFiles.length) {
    return {
      name: 'Ajna pipeline',
      status: 'PASS',
      detail: `All ${ajnaFiles.length} core modules present`,
    }
  }
  return {
    name: 'Ajna pipeline',
    status: 'WARN',
    detail: `${existing.length}/${ajnaFiles.length} core modules found`,
  }
}

export function checkPersistenceLayer(): DoctorCheck {
  const storageFiles = [
    'src/storage/jsonl-store.ts',
    'src/storage/storage-paths.ts',
    'src/storage/session-persistence.ts',
  ]

  const cwd = process.cwd()
  const existing = storageFiles.filter((f) => fs.existsSync(path.join(cwd, f)))

  if (existing.length === storageFiles.length) {
    return {
      name: 'Persistence layer',
      status: 'PASS',
      detail: `All ${storageFiles.length} storage modules present`,
    }
  }
  return {
    name: 'Persistence layer',
    status: 'WARN',
    detail: `${existing.length}/${storageFiles.length} storage modules found`,
  }
}

export function checkAgentLoop(): DoctorCheck {
  const agentFiles = [
    'src/agent/agent-loop.ts',
    'src/agent/agent-loop.types.ts',
    'src/agent/tool-schema-bridge.ts',
  ]

  const cwd = process.cwd()
  const existing = agentFiles.filter((f) => fs.existsSync(path.join(cwd, f)))

  if (existing.length === agentFiles.length) {
    return {
      name: 'Agent loop',
      status: 'PASS',
      detail: `All ${agentFiles.length} agent modules present`,
    }
  }
  return {
    name: 'Agent loop',
    status: 'FAIL',
    detail: `${existing.length}/${agentFiles.length} agent modules found`,
  }
}

export function checkToolRegistry(workspaceRoot: string): DoctorCheck {
  const toolsDir = path.join(workspaceRoot, 'src', 'runtime', 'tools')
  if (!fs.existsSync(toolsDir)) {
    return { name: 'Tool registry', status: 'FAIL', detail: 'Tools directory not found' }
  }

  const toolFiles = fs
    .readdirSync(toolsDir)
    .filter((f) => f.endsWith('-tool.ts') && !f.endsWith('.spec.ts'))

  if (toolFiles.length >= 10) {
    return {
      name: 'Tool registry',
      status: 'PASS',
      detail: `${toolFiles.length} tool definitions found`,
    }
  }
  return {
    name: 'Tool registry',
    status: 'WARN',
    detail: `Only ${toolFiles.length} tool definitions found`,
  }
}

export function checkTuiLayer(): DoctorCheck {
  const tuiFiles = [
    'src/tui/tui.types.ts',
    'src/tui/tui-event-handler.ts',
    'src/tui/tui-renderer.ts',
  ]

  const cwd = process.cwd()
  const existing = tuiFiles.filter((f) => fs.existsSync(path.join(cwd, f)))

  if (existing.length === tuiFiles.length) {
    return {
      name: 'TUI layer',
      status: 'PASS',
      detail: `All ${tuiFiles.length} TUI modules present`,
    }
  }
  return {
    name: 'TUI layer',
    status: 'WARN',
    detail: `${existing.length}/${tuiFiles.length} TUI modules found`,
  }
}

export function runActivationReadinessChecks(workspaceRoot: string): readonly DoctorCheck[] {
  return [
    checkProviderConfig(),
    checkAgentLoop(),
    checkToolRegistry(workspaceRoot),
    checkHiveMindRegistry(),
    checkAjnaPipeline(),
    checkPersistenceLayer(),
    checkTuiLayer(),
  ]
}

export function renderActivationReadiness(checks: readonly DoctorCheck[]): string {
  const lines = ['SymbolWright Activation Readiness', '']

  for (const check of checks) {
    const icon = check.status === 'PASS' ? '[PASS]' : check.status === 'FAIL' ? '[FAIL]' : '[WARN]'
    lines.push(`  ${icon} ${check.name}: ${check.detail}`)
  }

  const passCount = checks.filter((c) => c.status === 'PASS').length
  const failCount = checks.filter((c) => c.status === 'FAIL').length
  const warnCount = checks.filter((c) => c.status === 'WARN').length

  lines.push('')
  lines.push(`Summary: ${passCount} passed, ${failCount} failed, ${warnCount} warnings`)

  const ready = failCount === 0
  lines.push(`Status: ${ready ? 'READY FOR ACTIVATION' : 'NOT READY — fix failures above'}`)

  return lines.join('\n')
}
