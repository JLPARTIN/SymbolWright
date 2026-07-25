export const SYMBOLWRIGHT_PROVIDER_ADAPTER_BLOCK_ID = 'SYMBOLWRIGHT-PROVIDER-ADAPTER-01' as const

export const SYMBOLWRIGHT_SUPPORTED_PROVIDER_IDS = [
  'openai',
  'anthropic',
  'google-gemini',
  'groq',
  'openrouter',
  'github-models',
  'ollama',
  'deepseek',
  'custom',
] as const

export const SYMBOLWRIGHT_PROVIDER_CAPABILITIES = [
  'chat',
  'streaming',
  'tool_use',
  'structured_output',
  'local_runtime',
] as const

export const SYMBOLWRIGHT_PROVIDER_KEY_HANDLING_MODES = [
  'server_vault',
  'request_scoped',
  'local_runtime',
] as const

export const SYMBOLWRIGHT_PROVIDER_ENDPOINT_OWNERSHIP_MODES = [
  'symbolwright_server',
  'browser_client',
  'external_client',
] as const

export type SymbolWrightProviderId = (typeof SYMBOLWRIGHT_SUPPORTED_PROVIDER_IDS)[number]
export type SymbolWrightProviderCapability = (typeof SYMBOLWRIGHT_PROVIDER_CAPABILITIES)[number]
export type SymbolWrightProviderKeyHandling =
  (typeof SYMBOLWRIGHT_PROVIDER_KEY_HANDLING_MODES)[number]
export type SymbolWrightProviderEndpointOwnership =
  (typeof SYMBOLWRIGHT_PROVIDER_ENDPOINT_OWNERSHIP_MODES)[number]

export interface SymbolWrightProviderAdapterContract {
  readonly id: SymbolWrightProviderId
  readonly displayName: string
  readonly credentialMode: SymbolWrightProviderKeyHandling
  readonly endpointOwnership: SymbolWrightProviderEndpointOwnership
  readonly browserSafe: boolean
  readonly capabilities: readonly SymbolWrightProviderCapability[]
  readonly defaultBaseUrl?: string
  readonly operatorNotes: readonly string[]
}

export interface SymbolWrightProviderAdapterSecurityCheck {
  readonly providerId: SymbolWrightProviderId
  readonly status: 'PASS' | 'FAIL'
  readonly detail: string
}

export interface SymbolWrightProviderAdapterContractReport {
  readonly blockId: typeof SYMBOLWRIGHT_PROVIDER_ADAPTER_BLOCK_ID
  readonly status: 'READY' | 'BLOCKED'
  readonly providerCount: number
  readonly checks: readonly SymbolWrightProviderAdapterSecurityCheck[]
}

export const SYMBOLWRIGHT_PROVIDER_ADAPTERS: readonly SymbolWrightProviderAdapterContract[] = [
  {
    id: 'openai',
    displayName: 'OpenAI',
    credentialMode: 'server_vault',
    endpointOwnership: 'symbolwright_server',
    browserSafe: false,
    capabilities: ['chat', 'streaming', 'tool_use', 'structured_output'],
    defaultBaseUrl: 'https://api.openai.com/v1',
    operatorNotes: [
      'Store provider credentials server-side only.',
      'Expose provider choice, not raw credential material.',
    ],
  },
  {
    id: 'anthropic',
    displayName: 'Anthropic',
    credentialMode: 'server_vault',
    endpointOwnership: 'symbolwright_server',
    browserSafe: false,
    capabilities: ['chat', 'streaming', 'tool_use'],
    defaultBaseUrl: 'https://api.anthropic.com',
    operatorNotes: ['Keep Anthropic credentials behind the SymbolWright gateway.'],
  },
  {
    id: 'google-gemini',
    displayName: 'Google Gemini',
    credentialMode: 'server_vault',
    endpointOwnership: 'symbolwright_server',
    browserSafe: false,
    capabilities: ['chat', 'streaming', 'structured_output'],
    defaultBaseUrl: 'https://generativelanguage.googleapis.com',
    operatorNotes: ['Use the adapter layer to normalize Gemini responses.'],
  },
  {
    id: 'groq',
    displayName: 'Groq',
    credentialMode: 'server_vault',
    endpointOwnership: 'symbolwright_server',
    browserSafe: false,
    capabilities: ['chat', 'streaming'],
    defaultBaseUrl: 'https://api.groq.com/openai/v1',
    operatorNotes: ['Route through SymbolWright so browsers never hold credentials.'],
  },
  {
    id: 'openrouter',
    displayName: 'OpenRouter',
    credentialMode: 'server_vault',
    endpointOwnership: 'symbolwright_server',
    browserSafe: false,
    capabilities: ['chat', 'streaming', 'structured_output'],
    defaultBaseUrl: 'https://openrouter.ai/api/v1',
    operatorNotes: ['Use as a model gateway while preserving audit boundaries.'],
  },
  {
    id: 'github-models',
    displayName: 'GitHub Models',
    credentialMode: 'server_vault',
    endpointOwnership: 'symbolwright_server',
    browserSafe: false,
    capabilities: ['chat', 'streaming'],
    operatorNotes: ['Use repository-scoped credentials from the server runtime.'],
  },
  {
    id: 'ollama',
    displayName: 'Ollama',
    credentialMode: 'local_runtime',
    endpointOwnership: 'symbolwright_server',
    browserSafe: false,
    capabilities: ['chat', 'streaming', 'local_runtime'],
    defaultBaseUrl: 'http://localhost:11434',
    operatorNotes: ['Treat local model access as a server-side runtime concern.'],
  },
  {
    id: 'deepseek',
    displayName: 'DeepSeek',
    credentialMode: 'server_vault',
    endpointOwnership: 'symbolwright_server',
    browserSafe: false,
    capabilities: ['chat', 'streaming', 'tool_use'],
    defaultBaseUrl: 'https://api.deepseek.com',
    operatorNotes: [
      'OpenAI-compatible wire format; route through SymbolWright so browsers never hold credentials.',
    ],
  },
  {
    id: 'custom',
    displayName: 'Custom provider',
    credentialMode: 'request_scoped',
    endpointOwnership: 'symbolwright_server',
    browserSafe: false,
    capabilities: ['chat', 'streaming'],
    operatorNotes: ['Custom providers must route through policy and redaction gates.'],
  },
] as const

export function getSymbolWrightProviderAdapterRegistry(): readonly SymbolWrightProviderAdapterContract[] {
  return SYMBOLWRIGHT_PROVIDER_ADAPTERS
}

export function findSymbolWrightProviderAdapter(
  providerId: string,
): SymbolWrightProviderAdapterContract | undefined {
  return SYMBOLWRIGHT_PROVIDER_ADAPTERS.find((adapter) => adapter.id === providerId)
}

export function assertProviderKeyNeverLeavesServer(
  adapter: SymbolWrightProviderAdapterContract,
): SymbolWrightProviderAdapterSecurityCheck {
  if (adapter.endpointOwnership !== 'symbolwright_server') {
    return {
      providerId: adapter.id,
      status: 'FAIL',
      detail: `${adapter.displayName} is not owned by the SymbolWright server endpoint`,
    }
  }

  if (adapter.browserSafe) {
    return {
      providerId: adapter.id,
      status: 'FAIL',
      detail: `${adapter.displayName} incorrectly allows browser-side provider credentials`,
    }
  }

  return {
    providerId: adapter.id,
    status: 'PASS',
    detail: `${adapter.displayName} credentials stay behind the SymbolWright server gateway`,
  }
}

export function buildProviderAdapterContractReport(): SymbolWrightProviderAdapterContractReport {
  const checks = SYMBOLWRIGHT_PROVIDER_ADAPTERS.map((adapter) =>
    assertProviderKeyNeverLeavesServer(adapter),
  )
  const hasFailures = checks.some((check) => check.status === 'FAIL')

  return {
    blockId: SYMBOLWRIGHT_PROVIDER_ADAPTER_BLOCK_ID,
    status: hasFailures ? 'BLOCKED' : 'READY',
    providerCount: SYMBOLWRIGHT_PROVIDER_ADAPTERS.length,
    checks,
  }
}

export function renderProviderAdapterContractReport(
  report: SymbolWrightProviderAdapterContractReport,
): string {
  return [
    'SymbolWright Provider Adapter Contract',
    '',
    `Block: ${report.blockId}`,
    `Status: ${report.status}`,
    `Providers: ${report.providerCount}`,
    '',
    'Credential boundary checks:',
    ...report.checks.map((check) => `  [${check.status}] ${check.providerId}: ${check.detail}`),
  ].join('\n')
}
