import {
  SYMBOLWRIGHT_EXTERNAL_CLIENT_KINDS,
  SYMBOLWRIGHT_PUBLIC_API_ROUTES,
  type SymbolWrightExternalClientKind,
} from '../api/universal-api-contract.js'
import { SYMBOLWRIGHT_PROVIDER_ADAPTERS } from '../providers/provider-adapter-contract.js'

export const SYMBOLWRIGHT_BROWSER_WORKSPACE_BLOCK_ID = 'SYMBOLWRIGHT-BROWSER-WORKSPACE-01' as const

export const SYMBOLWRIGHT_BROWSER_WORKSPACE_PANELS = [
  'mission-input',
  'chat-console',
  'terminal-output',
  'tool-history',
  'github-pr-panel',
  'audit-evidence-panel',
  'memory-rag-panel',
  'provider-selector',
  'api-key-manager',
  'session-history',
] as const

export type SymbolWrightBrowserWorkspacePanel =
  (typeof SYMBOLWRIGHT_BROWSER_WORKSPACE_PANELS)[number]
export type SymbolWrightBrowserWorkspaceKeyBoundary =
  | 'browser_to_symbolwright_only'
  | 'browser_to_provider_direct'
export type SymbolWrightBrowserWorkspaceProviderKeyStorage =
  | 'server_side_vault_or_request_scoped_server_runtime'
  | 'browser_runtime'

export interface SymbolWrightBrowserWorkspaceContract {
  readonly blockId: typeof SYMBOLWRIGHT_BROWSER_WORKSPACE_BLOCK_ID
  readonly entrypoint: '/symbolwright'
  readonly panels: readonly SymbolWrightBrowserWorkspacePanel[]
  readonly supportedClients: readonly SymbolWrightExternalClientKind[]
  readonly publicApiRouteCount: number
  readonly providerCount: number
  readonly keyBoundary: SymbolWrightBrowserWorkspaceKeyBoundary
  readonly providerKeyStorage: SymbolWrightBrowserWorkspaceProviderKeyStorage
  readonly browserStoresProviderKeys: boolean
}

export interface SymbolWrightBrowserWorkspaceReadinessReport {
  readonly blockId: typeof SYMBOLWRIGHT_BROWSER_WORKSPACE_BLOCK_ID
  readonly status: 'READY' | 'BLOCKED'
  readonly findings: readonly string[]
  readonly contract: SymbolWrightBrowserWorkspaceContract
}

export function buildBrowserWorkspaceContract(): SymbolWrightBrowserWorkspaceContract {
  return {
    blockId: SYMBOLWRIGHT_BROWSER_WORKSPACE_BLOCK_ID,
    entrypoint: '/symbolwright',
    panels: SYMBOLWRIGHT_BROWSER_WORKSPACE_PANELS,
    supportedClients: SYMBOLWRIGHT_EXTERNAL_CLIENT_KINDS,
    publicApiRouteCount: SYMBOLWRIGHT_PUBLIC_API_ROUTES.length,
    providerCount: SYMBOLWRIGHT_PROVIDER_ADAPTERS.length,
    keyBoundary: 'browser_to_symbolwright_only',
    providerKeyStorage: 'server_side_vault_or_request_scoped_server_runtime',
    browserStoresProviderKeys: false,
  }
}

export function assessBrowserWorkspaceReadiness(
  contract: SymbolWrightBrowserWorkspaceContract = buildBrowserWorkspaceContract(),
): SymbolWrightBrowserWorkspaceReadinessReport {
  const findings: string[] = []

  for (const panel of SYMBOLWRIGHT_BROWSER_WORKSPACE_PANELS) {
    if (!contract.panels.includes(panel)) {
      findings.push(`Missing browser workspace panel: ${panel}`)
    }
  }

  if (contract.publicApiRouteCount < 6) {
    findings.push('Browser workspace does not expose the complete public API route set')
  }
  if (contract.providerCount < 6) {
    findings.push('Browser workspace does not expose enough provider choices')
  }
  if (contract.browserStoresProviderKeys) {
    findings.push('Browser workspace must not persist provider key material')
  }
  if (contract.keyBoundary !== 'browser_to_symbolwright_only') {
    findings.push('Browser workspace must route through SymbolWright before provider calls')
  }

  return {
    blockId: SYMBOLWRIGHT_BROWSER_WORKSPACE_BLOCK_ID,
    status: findings.length === 0 ? 'READY' : 'BLOCKED',
    findings,
    contract,
  }
}

export function renderBrowserWorkspaceReadinessReport(
  report: SymbolWrightBrowserWorkspaceReadinessReport,
): string {
  const lines = [
    'SymbolWright Browser Workspace Contract',
    '',
    `Block: ${report.blockId}`,
    `Status: ${report.status}`,
    `Entrypoint: ${report.contract.entrypoint}`,
    `Panels: ${report.contract.panels.join(', ')}`,
    `Supported clients: ${report.contract.supportedClients.join(', ')}`,
    `Provider key boundary: ${report.contract.keyBoundary}`,
    `Provider key storage: ${report.contract.providerKeyStorage}`,
  ]

  if (report.findings.length > 0) {
    lines.push('', 'Findings:', ...report.findings.map((finding) => `  - ${finding}`))
  } else {
    lines.push('', 'Findings: none')
  }

  return lines.join('\n')
}
