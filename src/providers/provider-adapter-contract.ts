export const CODEMIND_PROVIDER_ADAPTER_BLOCK_ID = 'CODEMIND-PROVIDER-ADAPTER-01' as const

export const CODEMIND_SUPPORTED_PROVIDER_IDS = [
  'openai',
  'anthropic',
  'google-gemini',
  'groq',
  'openrouter',
  'github-models',
  'ollama',
  'custom',
] as const

export const CODEMIND_PROVIDER_CAPABILITIES = [
  'chat',
  'streaming',
  'tool_use',
  'structured_output',
  'local_runtime',
] as const

export const CODEMIND_PROVIDER_KEY_HANDLING_MODES = [
  'server_vault',
  'request_scoped',
  'local_runtime',
] as const

export const CODEMIND_PROVIDER_ENDPOINT_OWNERSHIP_MODES = [
  'codemind_server',
  'browser_client',
  'external_client',
] as const

export type CodemindProviderId = (typeof CODEMIND_SUPPORTED_PROVIDER_IDS)[number]
export type CodemindProviderCapability = (typeof CODEMIND_PROVIDER_CAPABILITIES)[number]
export type CodemindProviderKeyHandling = (typeof CODEMIND_PROVIDER_KEY_HANDLING_MODES)[number]
export type CodemindProviderEndpointOwnership =
  (typeof CODEMIND_PROVIDER_ENDPOINT_OWNERSHIP_MODES)[number]

export interface CodemindProviderAdapterContract {
  readonly id: CodemindProviderId
  readonly displayName: string
  readonly credentialMode: CodemindProviderKeyHandling
  readonly endpointOwnership: CodemindProviderEndpointOwnership
  readonly browserSafe: boolean
  readonly capabilities: readonly CodemindProviderCapability[]
  readonly defaultBaseUrl?: string
  readonly operatorNotes: readonly string[]
}

export interface CodemindProviderAdapterSecurityCheck {
  readonly providerId: CodemindProviderId
  readonly status: 'PASS' | 'FAIL'
  readonly detail: string
}

export interface CodemindProviderAdapterContractReport {
  readonly blockId: typeof CODEMIND_PROVIDER_ADAPTER_BLOCK_ID
  readonly status: 'READY' | 'BLOCKED'
  readonly providerCount: number
  readonly checks: readonly CodemindProviderAdapterSecurityCheck[]
}

export const CODEMIND_PROVIDER_ADAPTERS: readonly CodemindProviderAdapterContract[] = [
  {
    id: 'openai',
    displayName: 'OpenAI',
    credentialMode: 'server_vault',
    endpointOwnership: 'codemind_server',
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
    endpointOwnership: 'codemind_server',
    browserSafe: false,
    capabilities: ['chat', 'streaming', 'tool_use'],
    defaultBaseUrl: 'https://api.anthropic.com',
    operatorNotes: ['Keep Anthropic credentials behind the CodeMind gateway.'],
  },
  {
    id: 'google-gemini',
    displayName: 'Google Gemini',
    credentialMode: 'server_vault',
    endpointOwnership: 'codemind_server',
    browserSafe: false,
    capabilities: ['chat', 'streaming', 'structured_output'],
    defaultBaseUrl: 'https://generativelanguage.googleapis.com',
    operatorNotes: ['Use the adapter layer to normalize Gemini responses.'],
  },
  {
    id: 'groq',
    displayName: 'Groq',
    credentialMode: 'server_vault',
    endpointOwnership: 'codemind_server',
    browserSafe: false,
    capabilities: ['chat', 'streaming'],
    defaultBaseUrl: 'https://api.groq.com/openai/v1',
    operatorNotes: ['Route through CodeMind so browsers never hold credentials.'],
  },
  {
    id: 'openrouter',
    displayName: 'OpenRouter',
    credentialMode: 'server_vault',
    endpointOwnership: 'codemind_server',
    browserSafe: false,
    capabilities: ['chat', 'streaming', 'structured_output'],
    defaultBaseUrl: 'https://openrouter.ai/api/v1',
    operatorNotes: ['Use as a model gateway while preserving audit boundaries.'],
  },
  {
    id: 'github-models',
    displayName: 'GitHub Models',
    credentialMode: 'server_vault',
    endpointOwnership: 'codemind_server',
    browserSafe: false,
    capabilities: ['chat', 'streaming'],
    operatorNotes: ['Use repository-scoped credentials from the server runtime.'],
  },
  {
    id: 'ollama',
    displayName: 'Ollama',
    credentialMode: 'local_runtime',
    endpointOwnership: 'codemind_server',
    browserSafe: false,
    capabilities: ['chat', 'streaming', 'local_runtime'],
    defaultBaseUrl: 'http://localhost:11434',
    operatorNotes: ['Treat local model access as a server-side runtime concern.'],
  },
  {
    id: 'custom',
    displayName: 'Custom provider',
    credentialMode: 'request_scoped',
    endpointOwnership: 'codemind_server',
    browserSafe: false,
    capabilities: ['chat', 'streaming'],
    operatorNotes: ['Custom providers must route through policy and redaction gates.'],
  },
] as const

export function getCodemindProviderAdapterRegistry(): readonly CodemindProviderAdapterContract[] {
  return CODEMIND_PROVIDER_ADAPTERS
}

export function findCodemindProviderAdapter(
  providerId: string,
): CodemindProviderAdapterContract | undefined {
  return CODEMIND_PROVIDER_ADAPTERS.find((adapter) => adapter.id === providerId)
}

export function assertProviderKeyNeverLeavesServer(
  adapter: CodemindProviderAdapterContract,
): CodemindProviderAdapterSecurityCheck {
  if (adapter.endpointOwnership !== 'codemind_server') {
    return {
      providerId: adapter.id,
      status: 'FAIL',
      detail: `${adapter.displayName} is not owned by the CodeMind server endpoint`,
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
    detail: `${adapter.displayName} credentials stay behind the CodeMind server gateway`,
  }
}

export function buildProviderAdapterContractReport(): CodemindProviderAdapterContractReport {
  const checks = CODEMIND_PROVIDER_ADAPTERS.map((adapter) =>
    assertProviderKeyNeverLeavesServer(adapter),
  )
  const hasFailures = checks.some((check) => check.status === 'FAIL')

  return {
    blockId: CODEMIND_PROVIDER_ADAPTER_BLOCK_ID,
    status: hasFailures ? 'BLOCKED' : 'READY',
    providerCount: CODEMIND_PROVIDER_ADAPTERS.length,
    checks,
  }
}

export function renderProviderAdapterContractReport(
  report: CodemindProviderAdapterContractReport,
): string {
  return [
    'CodeMind Provider Adapter Contract',
    '',
    `Block: ${report.blockId}`,
    `Status: ${report.status}`,
    `Providers: ${report.providerCount}`,
    '',
    'Credential boundary checks:',
    ...report.checks.map(
      (check) => `  [${check.status}] ${check.providerId}: ${check.detail}`,
    ),
  ].join('\n')
}
