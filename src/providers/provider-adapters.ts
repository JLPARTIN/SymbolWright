import type { CodemindProviderId } from './provider-adapter-contract.js'
import { ProviderGatewayError } from './provider-errors.js'
import type {
  ProviderAdapterHttpPlan,
  ProviderGatewayAdapter,
  ProviderGatewayMessage,
  ProviderGatewayRequest,
  ProviderGatewayResponse,
  ProviderGatewayUsage,
  ProviderHttpResponse,
  ProviderResolvedConfig,
} from './provider-gateway.types.js'

type JsonRecord = Record<string, unknown>

function asRecord(value: unknown): JsonRecord {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return value as JsonRecord
  }
  throw new ProviderGatewayError('INVALID_RESPONSE', 'Provider response was not an object')
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function buildUsage(
  inputTokens: number | undefined,
  outputTokens: number | undefined,
  totalTokens: number | undefined,
): ProviderGatewayUsage | undefined {
  const usage = {
    ...(inputTokens === undefined ? {} : { inputTokens }),
    ...(outputTokens === undefined ? {} : { outputTokens }),
    ...(totalTokens === undefined ? {} : { totalTokens }),
  }

  return Object.keys(usage).length === 0 ? undefined : usage
}

function requireModel(request: ProviderGatewayRequest, config: ProviderResolvedConfig): string {
  const model = request.model ?? config.defaultModel
  if (model === undefined || model.trim().length === 0) {
    throw new ProviderGatewayError('MISSING_MODEL', `${config.displayName} requires a model`, {
      providerId: config.id,
    })
  }
  return model
}

function requireApiKey(config: ProviderResolvedConfig): string {
  if (config.apiKey === undefined) {
    throw new ProviderGatewayError(
      'MISSING_CREDENTIALS',
      `${config.displayName} API key is missing`,
      {
        providerId: config.id,
      },
    )
  }
  return config.apiKey
}

function joinUrl(baseUrl: string, suffix: string): string {
  return `${baseUrl.replace(/\/$/, '')}${suffix}`
}

function normalizeMessages(request: ProviderGatewayRequest): readonly ProviderGatewayMessage[] {
  const messages: ProviderGatewayMessage[] = []

  if (request.systemPrompt !== undefined && request.systemPrompt.trim().length > 0) {
    messages.push({ role: 'system', content: request.systemPrompt })
  }

  messages.push(...request.messages)
  return messages
}

function parseUsage(rawUsage: unknown): ProviderGatewayUsage | undefined {
  const usage =
    typeof rawUsage === 'object' && rawUsage !== null ? (rawUsage as JsonRecord) : undefined
  if (usage === undefined) {
    return undefined
  }

  return buildUsage(
    typeof usage['prompt_tokens'] === 'number' ? usage['prompt_tokens'] : undefined,
    typeof usage['completion_tokens'] === 'number' ? usage['completion_tokens'] : undefined,
    typeof usage['total_tokens'] === 'number' ? usage['total_tokens'] : undefined,
  )
}

function parseOpenAiCompatibleResponse(
  providerId: CodemindProviderId,
  model: string,
  response: ProviderHttpResponse,
): ProviderGatewayResponse {
  if (response.status < 200 || response.status >= 300) {
    throw new ProviderGatewayError('HTTP_ERROR', `${providerId} returned HTTP ${response.status}`, {
      providerId,
      status: response.status,
    })
  }

  const body = asRecord(response.body)
  const choices = Array.isArray(body['choices']) ? body['choices'] : []
  const firstChoice = choices[0]
  const choice =
    typeof firstChoice === 'object' && firstChoice !== null ? (firstChoice as JsonRecord) : {}
  const message = asRecord(choice['message'] ?? {})
  const text = readString(message['content'])

  if (text === undefined) {
    throw new ProviderGatewayError('INVALID_RESPONSE', `${providerId} response missing text`, {
      providerId,
      status: response.status,
    })
  }

  const usage = parseUsage(body['usage'])

  return {
    providerId,
    model,
    text,
    ...(usage === undefined ? {} : { usage }),
    raw: body,
  }
}

function buildOpenAiCompatiblePlan(
  providerId: CodemindProviderId,
  request: ProviderGatewayRequest,
  config: ProviderResolvedConfig,
  options: { readonly apiKeyRequired: boolean },
): ProviderAdapterHttpPlan {
  const model = requireModel(request, config)
  const apiKey = options.apiKeyRequired ? requireApiKey(config) : config.apiKey
  const messages = normalizeMessages(request)
  const headers: Record<string, string> = {
    'content-type': 'application/json',
  }

  if (apiKey !== undefined) {
    headers['authorization'] = `Bearer ${apiKey}`
  }

  const body: JsonRecord = {
    model,
    messages,
  }

  if (request.temperature !== undefined) {
    body['temperature'] = request.temperature
  }
  if (request.maxTokens !== undefined) {
    body['max_tokens'] = request.maxTokens
  }
  if (request.responseFormat === 'json') {
    body['response_format'] = { type: 'json_object' }
  }

  return {
    request: {
      method: 'POST',
      url: joinUrl(config.baseUrl, '/chat/completions'),
      headers,
      body: JSON.stringify(body),
    },
    parser: (response) => parseOpenAiCompatibleResponse(providerId, model, response),
  }
}

function extractAnthropicSystem(request: ProviderGatewayRequest): string | undefined {
  const systemMessages = normalizeMessages(request)
    .filter((message) => message.role === 'system')
    .map((message) => message.content)
    .filter((content) => content.trim().length > 0)

  return systemMessages.length === 0 ? undefined : systemMessages.join('\n\n')
}

function buildAnthropicMessages(
  request: ProviderGatewayRequest,
): readonly ProviderGatewayMessage[] {
  return normalizeMessages(request).filter((message) => message.role !== 'system')
}

function parseAnthropicResponse(
  providerId: CodemindProviderId,
  model: string,
  response: ProviderHttpResponse,
): ProviderGatewayResponse {
  if (response.status < 200 || response.status >= 300) {
    throw new ProviderGatewayError('HTTP_ERROR', `${providerId} returned HTTP ${response.status}`, {
      providerId,
      status: response.status,
    })
  }

  const body = asRecord(response.body)
  const content = Array.isArray(body['content']) ? body['content'] : []
  const text = content
    .map((part) => {
      const record = typeof part === 'object' && part !== null ? (part as JsonRecord) : undefined
      return record?.['type'] === 'text' ? readString(record['text']) : undefined
    })
    .filter((part): part is string => part !== undefined)
    .join('')

  if (text.length === 0) {
    throw new ProviderGatewayError('INVALID_RESPONSE', 'Anthropic response missing text', {
      providerId,
      status: response.status,
    })
  }

  const rawUsage = asRecord(body['usage'] ?? {})
  const usage = buildUsage(
    typeof rawUsage['input_tokens'] === 'number' ? rawUsage['input_tokens'] : undefined,
    typeof rawUsage['output_tokens'] === 'number' ? rawUsage['output_tokens'] : undefined,
    undefined,
  )

  return {
    providerId,
    model,
    text,
    ...(usage === undefined ? {} : { usage }),
    raw: body,
  }
}

function createAnthropicAdapter(): ProviderGatewayAdapter {
  return {
    id: 'anthropic',
    displayName: 'Anthropic',
    requiredApiKey: true,
    buildHttpPlan(request, config) {
      const model = requireModel(request, config)
      const apiKey = requireApiKey(config)
      const body: JsonRecord = {
        model,
        max_tokens: request.maxTokens ?? 1024,
        messages: buildAnthropicMessages(request),
      }

      const system = extractAnthropicSystem(request)
      if (system !== undefined) {
        body['system'] = system
      }
      if (request.temperature !== undefined) {
        body['temperature'] = request.temperature
      }

      return {
        request: {
          method: 'POST',
          url: joinUrl(config.baseUrl, '/v1/messages'),
          headers: {
            'content-type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify(body),
        },
        parser: (response) => parseAnthropicResponse('anthropic', model, response),
      }
    },
  }
}

function parseGoogleResponse(
  providerId: CodemindProviderId,
  model: string,
  response: ProviderHttpResponse,
): ProviderGatewayResponse {
  if (response.status < 200 || response.status >= 300) {
    throw new ProviderGatewayError('HTTP_ERROR', `${providerId} returned HTTP ${response.status}`, {
      providerId,
      status: response.status,
    })
  }

  const body = asRecord(response.body)
  const candidates = Array.isArray(body['candidates']) ? body['candidates'] : []
  const firstCandidate = candidates[0]
  const candidate =
    typeof firstCandidate === 'object' && firstCandidate !== null
      ? (firstCandidate as JsonRecord)
      : {}
  const content = asRecord(candidate['content'] ?? {})
  const parts = Array.isArray(content['parts']) ? content['parts'] : []
  const text = parts
    .map((part) => {
      const record = typeof part === 'object' && part !== null ? (part as JsonRecord) : undefined
      return record === undefined ? undefined : readString(record['text'])
    })
    .filter((part): part is string => part !== undefined)
    .join('')

  if (text.length === 0) {
    throw new ProviderGatewayError('INVALID_RESPONSE', 'Google Gemini response missing text', {
      providerId,
      status: response.status,
    })
  }

  return {
    providerId,
    model,
    text,
    raw: body,
  }
}

function createGoogleAdapter(): ProviderGatewayAdapter {
  return {
    id: 'google-gemini',
    displayName: 'Google Gemini',
    requiredApiKey: true,
    buildHttpPlan(request, config) {
      const model = requireModel(request, config)
      const apiKey = requireApiKey(config)
      const systemMessages = normalizeMessages(request).filter(
        (message) => message.role === 'system',
      )
      const conversation = normalizeMessages(request).filter((message) => message.role !== 'system')
      const body: JsonRecord = {
        contents: conversation.map((message) => ({
          role: message.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: message.content }],
        })),
      }

      if (systemMessages.length > 0) {
        body['systemInstruction'] = {
          parts: systemMessages.map((message) => ({ text: message.content })),
        }
      }

      if (request.temperature !== undefined || request.maxTokens !== undefined) {
        body['generationConfig'] = {
          ...(request.temperature === undefined ? {} : { temperature: request.temperature }),
          ...(request.maxTokens === undefined ? {} : { maxOutputTokens: request.maxTokens }),
        }
      }

      return {
        request: {
          method: 'POST',
          url: `${joinUrl(config.baseUrl, `/v1beta/models/${encodeURIComponent(model)}:generateContent`)}?key=${encodeURIComponent(apiKey)}`,
          headers: {
            'content-type': 'application/json',
          },
          body: JSON.stringify(body),
        },
        parser: (response) => parseGoogleResponse('google-gemini', model, response),
      }
    },
  }
}

function createOpenAiCompatibleAdapter(
  providerId: CodemindProviderId,
  displayName: string,
  apiKeyRequired: boolean,
): ProviderGatewayAdapter {
  return {
    id: providerId,
    displayName,
    requiredApiKey: apiKeyRequired,
    buildHttpPlan(request, config) {
      return buildOpenAiCompatiblePlan(providerId, request, config, { apiKeyRequired })
    },
  }
}

export const PROVIDER_GATEWAY_ADAPTERS: readonly ProviderGatewayAdapter[] = [
  createOpenAiCompatibleAdapter('openai', 'OpenAI', true),
  createAnthropicAdapter(),
  createGoogleAdapter(),
  createOpenAiCompatibleAdapter('groq', 'Groq', true),
  createOpenAiCompatibleAdapter('openrouter', 'OpenRouter', true),
  createOpenAiCompatibleAdapter('github-models', 'GitHub Models', true),
  createOpenAiCompatibleAdapter('ollama', 'Ollama', false),
  createOpenAiCompatibleAdapter('custom', 'Custom provider', false),
]

export function findProviderGatewayAdapter(
  providerId: CodemindProviderId,
): ProviderGatewayAdapter | undefined {
  return PROVIDER_GATEWAY_ADAPTERS.find((adapter) => adapter.id === providerId)
}
