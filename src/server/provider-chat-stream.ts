import type { SymbolWrightProviderId } from '../providers/provider-adapter-contract.js'
import { ProviderGatewayError } from '../providers/provider-errors.js'
import type {
  ProviderGatewayMessage,
  ProviderGatewayRequest,
  ProviderResolvedConfig,
} from '../providers/provider-gateway.types.js'

export interface ProviderStreamHttpRequest {
  readonly method: 'POST'
  readonly url: string
  readonly headers: Readonly<Record<string, string>>
  readonly body: string
}

export interface ProviderStreamHttpResponse {
  readonly status: number
  readonly body: AsyncIterable<string>
}

export interface ProviderStreamTransport {
  requestStream(request: ProviderStreamHttpRequest): Promise<ProviderStreamHttpResponse>
}

const REALTIME_STREAMING_PROVIDERS = new Set<SymbolWrightProviderId>([
  'openai',
  'groq',
  'openrouter',
  'github-models',
  'ollama',
  'custom',
  'anthropic',
  'google-gemini',
  'deepseek',
])

export function supportsRealtimeStreaming(providerId: SymbolWrightProviderId): boolean {
  return REALTIME_STREAMING_PROVIDERS.has(providerId)
}

async function* readLines(body: AsyncIterable<string>): AsyncGenerator<string> {
  let buffer = ''
  for await (const chunk of body) {
    buffer += chunk
    let newlineIndex = buffer.indexOf('\n')
    while (newlineIndex !== -1) {
      yield buffer.slice(0, newlineIndex).replace(/\r$/, '')
      buffer = buffer.slice(newlineIndex + 1)
      newlineIndex = buffer.indexOf('\n')
    }
  }
  if (buffer.length > 0) {
    yield buffer.replace(/\r$/, '')
  }
}

export function joinStreamUrl(baseUrl: string, suffix: string): string {
  return `${baseUrl.replace(/\/$/, '')}${suffix}`
}

function normalizeStreamMessages(
  request: ProviderGatewayRequest,
): readonly ProviderGatewayMessage[] {
  const messages: ProviderGatewayMessage[] = []
  if (request.systemPrompt !== undefined && request.systemPrompt.trim().length > 0) {
    messages.push({ role: 'system', content: request.systemPrompt })
  }
  messages.push(...request.messages)
  return messages
}

/** Parses one OpenAI-compatible `data: {...}` SSE line into a text delta, if any. */
export function parseOpenAiCompatibleSseLine(line: string): string | undefined {
  if (!line.startsWith('data:')) {
    return undefined
  }
  const payload = line.slice('data:'.length).trim()
  if (payload.length === 0 || payload === '[DONE]') {
    return undefined
  }

  try {
    const parsed = JSON.parse(payload) as {
      readonly choices?: readonly { readonly delta?: { readonly content?: string } }[]
    }
    return parsed.choices?.[0]?.delta?.content
  } catch {
    return undefined
  }
}

function buildOpenAiCompatibleStreamRequest(
  request: ProviderGatewayRequest,
  config: ProviderResolvedConfig,
  model: string,
): ProviderStreamHttpRequest {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (config.apiKey !== undefined) {
    headers['authorization'] = `Bearer ${config.apiKey}`
  }

  const body: Record<string, unknown> = {
    model,
    messages: normalizeStreamMessages(request),
    stream: true,
  }
  if (request.temperature !== undefined) {
    body['temperature'] = request.temperature
  }
  if (request.maxTokens !== undefined) {
    body['max_tokens'] = request.maxTokens
  }

  return {
    method: 'POST',
    url: joinStreamUrl(config.baseUrl, '/chat/completions'),
    headers,
    body: JSON.stringify(body),
  }
}

/** Parses one Anthropic SSE frame (event + data line) into a text delta, if any. */
export function parseAnthropicSseFrame(
  eventType: string | undefined,
  dataLine: string | undefined,
): string | undefined {
  if (eventType !== 'content_block_delta' || dataLine === undefined) {
    return undefined
  }
  if (!dataLine.startsWith('data:')) {
    return undefined
  }

  try {
    const parsed = JSON.parse(dataLine.slice('data:'.length).trim()) as {
      readonly delta?: { readonly type?: string; readonly text?: string }
    }
    return parsed.delta?.type === 'text_delta' ? parsed.delta.text : undefined
  } catch {
    return undefined
  }
}

function buildAnthropicStreamRequest(
  request: ProviderGatewayRequest,
  config: ProviderResolvedConfig,
  model: string,
): ProviderStreamHttpRequest {
  if (config.apiKey === undefined) {
    throw new ProviderGatewayError(
      'MISSING_CREDENTIALS',
      `${config.displayName} API key is missing`,
      {
        providerId: config.id,
      },
    )
  }

  const systemMessages = normalizeStreamMessages(request)
    .filter((message) => message.role === 'system')
    .map((message) => message.content)

  const body: Record<string, unknown> = {
    model,
    max_tokens: request.maxTokens ?? 1024,
    stream: true,
    messages: normalizeStreamMessages(request).filter((message) => message.role !== 'system'),
  }
  if (systemMessages.length > 0) {
    body['system'] = systemMessages.join('\n\n')
  }
  if (request.temperature !== undefined) {
    body['temperature'] = request.temperature
  }

  return {
    method: 'POST',
    url: joinStreamUrl(config.baseUrl, '/v1/messages'),
    headers: {
      'content-type': 'application/json',
      'x-api-key': config.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  }
}

/** Parses one Gemini SSE `data: {...}` line into a text delta, if any. */
export function parseGeminiSseLine(line: string): string | undefined {
  if (!line.startsWith('data:')) {
    return undefined
  }
  const payload = line.slice('data:'.length).trim()
  if (payload.length === 0) {
    return undefined
  }

  try {
    const parsed = JSON.parse(payload) as {
      readonly candidates?: readonly {
        readonly content?: { readonly parts?: readonly { readonly text?: string }[] }
      }[]
    }
    const parts = parsed.candidates?.[0]?.content?.parts ?? []
    const text = parts
      .map((part) => part.text)
      .filter((text): text is string => text !== undefined)
      .join('')
    return text.length > 0 ? text : undefined
  } catch {
    return undefined
  }
}

function buildGeminiStreamRequest(
  request: ProviderGatewayRequest,
  config: ProviderResolvedConfig,
  model: string,
): ProviderStreamHttpRequest {
  if (config.apiKey === undefined) {
    throw new ProviderGatewayError(
      'MISSING_CREDENTIALS',
      `${config.displayName} API key is missing`,
      { providerId: config.id },
    )
  }

  const systemMessages = normalizeStreamMessages(request)
    .filter((message) => message.role === 'system')
    .map((message) => message.content)
  const conversation = normalizeStreamMessages(request).filter(
    (message) => message.role !== 'system',
  )

  const body: Record<string, unknown> = {
    contents: conversation.map((message) => ({
      role: message.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: message.content }],
    })),
  }

  if (systemMessages.length > 0) {
    body['systemInstruction'] = { parts: systemMessages.map((text) => ({ text })) }
  }
  if (request.temperature !== undefined || request.maxTokens !== undefined) {
    body['generationConfig'] = {
      ...(request.temperature === undefined ? {} : { temperature: request.temperature }),
      ...(request.maxTokens === undefined ? {} : { maxOutputTokens: request.maxTokens }),
    }
  }

  return {
    method: 'POST',
    url: `${joinStreamUrl(
      config.baseUrl,
      `/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent`,
    )}?alt=sse&key=${encodeURIComponent(config.apiKey)}`,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }
}

async function* streamGemini(
  config: ProviderResolvedConfig,
  request: ProviderGatewayRequest,
  transport: ProviderStreamTransport,
): AsyncGenerator<string> {
  const model = requireStreamModel(request, config)
  const httpRequest = buildGeminiStreamRequest(request, config, model)
  const response = await transport.requestStream(httpRequest)
  if (response.status < 200 || response.status >= 300) {
    throw new ProviderGatewayError('HTTP_ERROR', `google-gemini returned HTTP ${response.status}`, {
      providerId: config.id,
      status: response.status,
    })
  }

  for await (const line of readLines(response.body)) {
    const delta = parseGeminiSseLine(line)
    if (delta !== undefined && delta.length > 0) {
      yield delta
    }
  }
}

function requireStreamModel(
  request: ProviderGatewayRequest,
  config: ProviderResolvedConfig,
): string {
  const model = request.model ?? config.defaultModel
  if (model === undefined || model.trim().length === 0) {
    throw new ProviderGatewayError('MISSING_MODEL', `${config.displayName} requires a model`, {
      providerId: config.id,
    })
  }
  return model
}

async function* streamOpenAiCompatible(
  config: ProviderResolvedConfig,
  request: ProviderGatewayRequest,
  transport: ProviderStreamTransport,
): AsyncGenerator<string> {
  const model = requireStreamModel(request, config)
  const httpRequest = buildOpenAiCompatibleStreamRequest(request, config, model)
  const response = await transport.requestStream(httpRequest)
  if (response.status < 200 || response.status >= 300) {
    throw new ProviderGatewayError('HTTP_ERROR', `${config.id} returned HTTP ${response.status}`, {
      providerId: config.id,
      status: response.status,
    })
  }

  for await (const line of readLines(response.body)) {
    const delta = parseOpenAiCompatibleSseLine(line)
    if (delta !== undefined && delta.length > 0) {
      yield delta
    }
  }
}

async function* streamAnthropic(
  config: ProviderResolvedConfig,
  request: ProviderGatewayRequest,
  transport: ProviderStreamTransport,
): AsyncGenerator<string> {
  const model = requireStreamModel(request, config)
  const httpRequest = buildAnthropicStreamRequest(request, config, model)
  const response = await transport.requestStream(httpRequest)
  if (response.status < 200 || response.status >= 300) {
    throw new ProviderGatewayError('HTTP_ERROR', `anthropic returned HTTP ${response.status}`, {
      providerId: config.id,
      status: response.status,
    })
  }

  let pendingEvent: string | undefined
  for await (const line of readLines(response.body)) {
    if (line.startsWith('event:')) {
      pendingEvent = line.slice('event:'.length).trim()
      continue
    }
    if (line.startsWith('data:')) {
      const delta = parseAnthropicSseFrame(pendingEvent, line)
      if (delta !== undefined && delta.length > 0) {
        yield delta
      }
    }
  }
}

export function streamProviderChat(
  config: ProviderResolvedConfig,
  request: ProviderGatewayRequest,
  transport: ProviderStreamTransport,
): AsyncGenerator<string> {
  if (config.id === 'anthropic') {
    return streamAnthropic(config, request, transport)
  }
  if (config.id === 'google-gemini') {
    return streamGemini(config, request, transport)
  }
  return streamOpenAiCompatible(config, request, transport)
}

export class FetchProviderStreamTransport implements ProviderStreamTransport {
  public async requestStream(
    request: ProviderStreamHttpRequest,
  ): Promise<ProviderStreamHttpResponse> {
    const response = await fetch(request.url, {
      method: request.method,
      headers: request.headers,
      body: request.body,
    })

    if (response.body === null) {
      return { status: response.status, body: emptyAsyncIterable() }
    }

    return { status: response.status, body: decodeReadableStream(response.body) }
  }
}

async function* emptyAsyncIterable(): AsyncGenerator<string> {}

async function* decodeReadableStream(stream: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) {
        return
      }
      yield decoder.decode(value, { stream: true })
    }
  } finally {
    reader.releaseLock()
  }
}
