import {
  CODEMIND_EXTERNAL_CLIENT_KINDS,
  CODEMIND_PUBLIC_API_ROUTES,
  type CodemindExternalClientKind,
} from '../api/universal-api-contract.js'
import { CODEMIND_PROVIDER_ADAPTERS } from '../providers/provider-adapter-contract.js'

export const CODEMIND_BROWSER_WORKSPACE_BLOCK_ID = 'CODEMIND-BROWSER-WORKSPACE-01' as const

export const CODEMIND_BROWSER_WORKSPACE_PANELS = [
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

export type CodemindBrowserWorkspacePanel = (typeof CODEMIND_BROWSER_WORKSPACE_PANELS)[number]
export type CodemindBrowserWorkspaceKeyBoundary =
  | 'browser_to_codemind_only'
  | 'browser_to_provider_direct'
export type CodemindBrowserWorkspaceProviderKeyStorage =
  | 'server_side_vault_or_request_scoped_server_runtime'
  | 'browser_runtime'

export interface CodemindBrowserWorkspaceContract {
  readonly blockId: typeof CODEMIND_BROWSER_WORKSPACE_BLOCK_ID
  readonly entrypoint: '/codemind'
  readonly panels: readonly CodemindBrowserWorkspacePanel[]
  readonly supportedClients: readonly CodemindExternalClientKind[]
  readonly publicApiRouteCount: number
  readonly providerCount: number
  readonly keyBoundary: CodemindBrowserWorkspaceKeyBoundary
  readonly providerKeyStorage: CodemindBrowserWorkspaceProviderKeyStorage
  readonly browserStoresProviderKeys: boolean
}

export interface CodemindBrowserWorkspaceReadinessReport {
  readonly blockId: typeof CODEMIND_BROWSER_WORKSPACE_BLOCK_ID
  readonly status: 'READY' | 'BLOCKED'
  readonly findings: readonly string[]
  readonly contract: CodemindBrowserWorkspaceContract
}

export function buildBrowserWorkspaceContract(): CodemindBrowserWorkspaceContract {
  return {
    blockId: CODEMIND_BROWSER_WORKSPACE_BLOCK_ID,
    entrypoint: '/codemind',
    panels: CODEMIND_BROWSER_WORKSPACE_PANELS,
    supportedClients: CODEMIND_EXTERNAL_CLIENT_KINDS,
    publicApiRouteCount: CODEMIND_PUBLIC_API_ROUTES.length,
    providerCount: CODEMIND_PROVIDER_ADAPTERS.length,
    keyBoundary: 'browser_to_codemind_only',
    providerKeyStorage: 'server_side_vault_or_request_scoped_server_runtime',
    browserStoresProviderKeys: false,
  }
}

export function assessBrowserWorkspaceReadiness(
  contract: CodemindBrowserWorkspaceContract = buildBrowserWorkspaceContract(),
): CodemindBrowserWorkspaceReadinessReport {
  const findings: string[] = []

  for (const panel of CODEMIND_BROWSER_WORKSPACE_PANELS) {
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
  if (contract.keyBoundary !== 'browser_to_codemind_only') {
    findings.push('Browser workspace must route through CodeMind before provider calls')
  }

  return {
    blockId: CODEMIND_BROWSER_WORKSPACE_BLOCK_ID,
    status: findings.length === 0 ? 'READY' : 'BLOCKED',
    findings,
    contract,
  }
}

export function renderBrowserWorkspaceReadinessReport(
  report: CodemindBrowserWorkspaceReadinessReport,
): string {
  const lines = [
    'CodeMind Browser Workspace Contract',
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
