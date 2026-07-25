import type {
  SymbolWrightProviderCapability,
  SymbolWrightProviderId,
} from './provider-adapter-contract.js'

export type ProviderGatewayRole = 'system' | 'user' | 'assistant'
export type ProviderGatewayResponseFormat = 'text' | 'json'
export type ProviderGatewayStatus = 'configured' | 'missing_credentials' | 'disabled'

export interface ProviderGatewayMessage {
  readonly role: ProviderGatewayRole
  readonly content: string
}

export interface ProviderGatewayUsage {
  readonly inputTokens?: number
  readonly outputTokens?: number
  readonly totalTokens?: number
}

export interface ProviderGatewayRequest {
  readonly providerId?: SymbolWrightProviderId
  readonly model?: string
  readonly systemPrompt?: string
  readonly messages: readonly ProviderGatewayMessage[]
  readonly temperature?: number
  readonly maxTokens?: number
  readonly responseFormat?: ProviderGatewayResponseFormat
}

export interface ProviderGatewayResponse {
  readonly providerId: SymbolWrightProviderId
  readonly model: string
  readonly text: string
  readonly usage?: ProviderGatewayUsage
  readonly raw: unknown
}

export interface ProviderHttpRequest {
  readonly method: 'GET' | 'POST'
  readonly url: string
  readonly headers: Readonly<Record<string, string>>
  readonly body?: string
}

export interface ProviderHttpResponse {
  readonly status: number
  readonly headers: Readonly<Record<string, string>>
  readonly body: unknown
}

export interface ProviderHttpTransport {
  request(request: ProviderHttpRequest): Promise<ProviderHttpResponse>
}

export interface ProviderResolvedConfig {
  readonly id: SymbolWrightProviderId
  readonly displayName: string
  readonly enabled: boolean
  readonly baseUrl: string
  readonly apiKey?: string
  readonly defaultModel?: string
  readonly capabilities: readonly SymbolWrightProviderCapability[]
}

export interface RedactedProviderConfig {
  readonly id: SymbolWrightProviderId
  readonly displayName: string
  readonly enabled: boolean
  readonly baseUrl: string
  readonly apiKey: 'configured' | 'missing'
  readonly defaultModel?: string
  readonly capabilities: readonly SymbolWrightProviderCapability[]
}

export interface ProviderGatewayConfig {
  readonly activeProvider?: SymbolWrightProviderId
  readonly activeModel?: string
  readonly fallbackProviders: readonly SymbolWrightProviderId[]
  readonly providers: Readonly<Record<SymbolWrightProviderId, ProviderResolvedConfig>>
}

export interface RedactedProviderGatewayConfig {
  readonly activeProvider?: SymbolWrightProviderId
  readonly activeModel?: string
  readonly fallbackProviders: readonly SymbolWrightProviderId[]
  readonly providers: readonly RedactedProviderConfig[]
}

export interface ProviderStatusReport {
  readonly providerId: SymbolWrightProviderId
  readonly status: ProviderGatewayStatus
  readonly detail: string
  readonly capabilities: readonly SymbolWrightProviderCapability[]
}

export interface ProviderAdapterHttpPlan {
  readonly request: ProviderHttpRequest
  readonly parser: (response: ProviderHttpResponse) => ProviderGatewayResponse
}

export interface ProviderGatewayAdapter {
  readonly id: SymbolWrightProviderId
  readonly displayName: string
  readonly requiredApiKey: boolean
  buildHttpPlan(
    request: ProviderGatewayRequest,
    config: ProviderResolvedConfig,
  ): ProviderAdapterHttpPlan
}
