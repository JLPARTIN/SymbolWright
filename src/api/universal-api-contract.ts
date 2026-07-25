import {
  SYMBOLWRIGHT_PROVIDER_ADAPTERS,
  buildProviderAdapterContractReport,
  type SymbolWrightProviderAdapterContract,
  type SymbolWrightProviderId,
} from '../providers/provider-adapter-contract.js'

export const SYMBOLWRIGHT_UNIVERSAL_API_BLOCK_ID = 'SYMBOLWRIGHT-UNIVERSAL-API-01' as const

export const SYMBOLWRIGHT_EXTERNAL_CLIENT_KINDS = [
  'browser',
  'chatgpt',
  'claude',
  'gemini',
  'cursor',
  'cline',
  'codex',
  'api-client',
] as const

export const SYMBOLWRIGHT_PUBLIC_API_ROUTE_METHODS = ['GET', 'POST'] as const

export type SymbolWrightExternalClientKind = (typeof SYMBOLWRIGHT_EXTERNAL_CLIENT_KINDS)[number]
export type SymbolWrightPublicApiRouteMethod =
  (typeof SYMBOLWRIGHT_PUBLIC_API_ROUTE_METHODS)[number]

export interface SymbolWrightPublicApiRoute {
  readonly method: SymbolWrightPublicApiRouteMethod
  readonly path: string
  readonly purpose: string
  readonly requiresSymbolWrightApiKey: boolean
  readonly browserMaySendRawProviderKey: boolean
  readonly allowedClients: readonly SymbolWrightExternalClientKind[]
  readonly allowedProviders: readonly SymbolWrightProviderId[]
}

export interface SymbolWrightExternalMissionRequest {
  readonly client: SymbolWrightExternalClientKind
  readonly provider: SymbolWrightProviderId
  readonly repo?: string
  readonly mission: string
  readonly stream?: boolean
}

export interface SymbolWrightExternalMissionValidation {
  readonly accepted: boolean
  readonly findings: readonly string[]
}

export interface SymbolWrightUniversalApiContractReport {
  readonly blockId: typeof SYMBOLWRIGHT_UNIVERSAL_API_BLOCK_ID
  readonly status: 'READY' | 'BLOCKED'
  readonly routeCount: number
  readonly providerBoundaryBlockId: string
  readonly supportedClients: readonly SymbolWrightExternalClientKind[]
  readonly findings: readonly string[]
}

const ALL_CLIENTS = SYMBOLWRIGHT_EXTERNAL_CLIENT_KINDS
const ALL_PROVIDERS = SYMBOLWRIGHT_PROVIDER_ADAPTERS.map((adapter) => adapter.id)

export const SYMBOLWRIGHT_PUBLIC_API_ROUTES: readonly SymbolWrightPublicApiRoute[] = [
  {
    method: 'POST',
    path: '/api/missions',
    purpose: 'Create a governed SymbolWright mission from any browser or external LLM client.',
    requiresSymbolWrightApiKey: true,
    browserMaySendRawProviderKey: false,
    allowedClients: ALL_CLIENTS,
    allowedProviders: ALL_PROVIDERS,
  },
  {
    method: 'POST',
    path: '/api/chat',
    purpose: 'Send conversational mission turns into the SymbolWright runtime.',
    requiresSymbolWrightApiKey: true,
    browserMaySendRawProviderKey: false,
    allowedClients: ALL_CLIENTS,
    allowedProviders: ALL_PROVIDERS,
  },
  {
    method: 'POST',
    path: '/api/tools/run',
    purpose: 'Run a governed tool through policy, approval, audit, and redaction gates.',
    requiresSymbolWrightApiKey: true,
    browserMaySendRawProviderKey: false,
    allowedClients: ALL_CLIENTS,
    allowedProviders: ALL_PROVIDERS,
  },
  {
    method: 'POST',
    path: '/api/providers/test',
    purpose: 'Verify provider adapter readiness without exposing credentials to the browser.',
    requiresSymbolWrightApiKey: true,
    browserMaySendRawProviderKey: false,
    allowedClients: ALL_CLIENTS,
    allowedProviders: ALL_PROVIDERS,
  },
  {
    method: 'GET',
    path: '/api/sessions/:id',
    purpose: 'Read a persisted mission session and its audit-safe state.',
    requiresSymbolWrightApiKey: true,
    browserMaySendRawProviderKey: false,
    allowedClients: ALL_CLIENTS,
    allowedProviders: ALL_PROVIDERS,
  },
  {
    method: 'GET',
    path: '/api/missions/:id/events',
    purpose: 'Stream mission events, tool output, logs, and PR readiness updates.',
    requiresSymbolWrightApiKey: true,
    browserMaySendRawProviderKey: false,
    allowedClients: ALL_CLIENTS,
    allowedProviders: ALL_PROVIDERS,
  },
] as const

export function getSymbolWrightPublicApiRoutes(): readonly SymbolWrightPublicApiRoute[] {
  return SYMBOLWRIGHT_PUBLIC_API_ROUTES
}

export function buildUniversalApiContractReport(
  routes: readonly SymbolWrightPublicApiRoute[] = SYMBOLWRIGHT_PUBLIC_API_ROUTES,
  providers: readonly SymbolWrightProviderAdapterContract[] = SYMBOLWRIGHT_PROVIDER_ADAPTERS,
): SymbolWrightUniversalApiContractReport {
  const findings: string[] = []
  const providerReport = buildProviderAdapterContractReport()

  if (routes.length === 0) {
    findings.push('No public API routes declared')
  }

  for (const route of routes) {
    if (!route.requiresSymbolWrightApiKey) {
      findings.push(
        `${route.method} ${route.path} does not require a SymbolWright access credential`,
      )
    }
    if (route.browserMaySendRawProviderKey) {
      findings.push(`${route.method} ${route.path} allows provider material from browser clients`)
    }
    if (route.allowedClients.length === 0) {
      findings.push(`${route.method} ${route.path} has no allowed external clients`)
    }
    if (route.allowedProviders.length === 0) {
      findings.push(`${route.method} ${route.path} has no allowed providers`)
    }
  }

  const providerIds = new Set(providers.map((provider) => provider.id))
  for (const route of routes) {
    for (const providerId of route.allowedProviders) {
      if (!providerIds.has(providerId)) {
        findings.push(
          `${route.method} ${route.path} references unregistered provider ${providerId}`,
        )
      }
    }
  }

  if (providerReport.status !== 'READY') {
    findings.push('Provider adapter boundary report is blocked')
  }

  return {
    blockId: SYMBOLWRIGHT_UNIVERSAL_API_BLOCK_ID,
    status: findings.length === 0 ? 'READY' : 'BLOCKED',
    routeCount: routes.length,
    providerBoundaryBlockId: providerReport.blockId,
    supportedClients: SYMBOLWRIGHT_EXTERNAL_CLIENT_KINDS,
    findings,
  }
}

export function validateExternalMissionRequest(
  request: SymbolWrightExternalMissionRequest,
): SymbolWrightExternalMissionValidation {
  const findings: string[] = []
  const routeReport = buildUniversalApiContractReport()
  const providerIds = new Set(SYMBOLWRIGHT_PROVIDER_ADAPTERS.map((provider) => provider.id))
  const clients = new Set<SymbolWrightExternalClientKind>(SYMBOLWRIGHT_EXTERNAL_CLIENT_KINDS)

  if (routeReport.status !== 'READY') {
    findings.push('Universal API contract is not release-ready')
  }
  if (!clients.has(request.client)) {
    findings.push(`Unsupported external client: ${request.client}`)
  }
  if (!providerIds.has(request.provider)) {
    findings.push(`Unsupported provider: ${request.provider}`)
  }
  if (request.mission.trim().length === 0) {
    findings.push('Mission text is required')
  }

  return {
    accepted: findings.length === 0,
    findings,
  }
}

export function renderUniversalApiContractReport(
  report: SymbolWrightUniversalApiContractReport,
): string {
  const lines = [
    'SymbolWright Universal API Contract',
    '',
    `Block: ${report.blockId}`,
    `Status: ${report.status}`,
    `Routes: ${report.routeCount}`,
    `Provider boundary: ${report.providerBoundaryBlockId}`,
    `External clients: ${report.supportedClients.join(', ')}`,
  ]

  if (report.findings.length > 0) {
    lines.push('', 'Findings:', ...report.findings.map((finding) => `  - ${finding}`))
  } else {
    lines.push('', 'Findings: none')
  }

  return lines.join('\n')
}
