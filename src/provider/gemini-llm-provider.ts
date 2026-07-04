import type {
  LLMProvider,
  ProviderCompletionOptions,
  ProviderContentBlock,
  ProviderMessage,
  ProviderStreamEvent,
  ProviderToolDefinition,
} from './provider.types.js'

export interface GeminiLlmProviderConfig {
  readonly baseUrl: string
  readonly apiKey: string
  readonly model?: string
}

export interface GeminiStreamHttpRequest {
  readonly url: string
  readonly headers: Readonly<Record<string, string>>
  readonly body: string
}

export interface GeminiStreamHttpResponse {
  readonly status: number
  readonly body: AsyncIterable<string>
}

export interface GeminiStreamTransport {
  request(req: GeminiStreamHttpRequest): Promise<GeminiStreamHttpResponse>
}

export class FetchGeminiStreamTransport implements GeminiStreamTransport {
  public async request(req: GeminiStreamHttpRequest): Promise<GeminiStreamHttpResponse> {
    const response = await fetch(req.url, { method: 'POST', headers: req.headers, body: req.body })
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
      if (done) return
      yield decoder.decode(value, { stream: true })
    }
  } finally {
    reader.releaseLock()
  }
}

async function* readSseLines(body: AsyncIterable<string>): AsyncGenerator<string> {
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

function joinUrl(baseUrl: string, suffix: string): string {
  return `${baseUrl.replace(/\/$/, '')}${suffix}`
}

function toGeminiFunctionDeclarations(
  tools: readonly ProviderToolDefinition[],
): readonly unknown[] {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    parameters: tool.inputSchema,
  }))
}

/** Maps each tool_use block's id to its function name, needed to build functionResponse parts (Gemini requires `name`, not just an id). */
function collectToolNamesById(messages: readonly ProviderMessage[]): Map<string, string> {
  const names = new Map<string, string>()
  for (const message of messages) {
    if (!Array.isArray(message.content)) continue
    for (const block of message.content) {
      if (block.type === 'tool_use') {
        names.set(block.id, block.name)
      }
    }
  }
  return names
}

function assistantBlocksToParts(blocks: readonly ProviderContentBlock[]): unknown[] {
  const parts: unknown[] = []
  for (const block of blocks) {
    if (block.type === 'text') {
      parts.push({ text: block.text })
    } else if (block.type === 'tool_use') {
      parts.push({ functionCall: { id: block.id, name: block.name, args: block.input } })
    }
  }
  return parts
}

function toolResultBlocksToParts(
  blocks: readonly ProviderContentBlock[],
  toolNamesById: ReadonlyMap<string, string>,
): unknown[] {
  return blocks
    .filter(
      (block): block is Extract<ProviderContentBlock, { type: 'tool_result' }> =>
        block.type === 'tool_result',
    )
    .map((block) => ({
      functionResponse: {
        id: block.toolUseId,
        name: toolNamesById.get(block.toolUseId) ?? 'unknown_function',
        response: block.isError === true ? { error: block.content } : { output: block.content },
      },
    }))
}

function toGeminiContents(messages: readonly ProviderMessage[]): unknown[] {
  const toolNamesById = collectToolNamesById(messages)

  return messages.map((message) => {
    if (typeof message.content === 'string') {
      return {
        role: message.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: message.content }],
      }
    }

    if (message.role === 'tool_result') {
      return { role: 'user', parts: toolResultBlocksToParts(message.content, toolNamesById) }
    }

    return { role: 'model', parts: assistantBlocksToParts(message.content) }
  })
}

interface GeminiFunctionCallPart {
  readonly functionCall?: {
    readonly id?: string
    readonly name: string
    readonly args?: Record<string, unknown>
  }
  readonly text?: string
}

interface GeminiStreamChunk {
  readonly candidates?: readonly {
    readonly content?: { readonly parts?: readonly GeminiFunctionCallPart[] }
    readonly finishReason?: string
  }[]
  readonly usageMetadata?: {
    readonly promptTokenCount?: number
    readonly candidatesTokenCount?: number
  }
}

function buildGeminiRequest(
  messages: readonly ProviderMessage[],
  tools: readonly ProviderToolDefinition[] | undefined,
  options: ProviderCompletionOptions | undefined,
  config: GeminiLlmProviderConfig,
  model: string,
): GeminiStreamHttpRequest {
  const body: Record<string, unknown> = { contents: toGeminiContents(messages) }

  if (options?.systemPrompt !== undefined && options.systemPrompt.trim().length > 0) {
    body['systemInstruction'] = { parts: [{ text: options.systemPrompt }] }
  }
  if (tools !== undefined && tools.length > 0) {
    body['tools'] = [{ functionDeclarations: toGeminiFunctionDeclarations(tools) }]
  }
  if (options?.temperature !== undefined || options?.maxTokens !== undefined) {
    body['generationConfig'] = {
      ...(options?.temperature === undefined ? {} : { temperature: options.temperature }),
      ...(options?.maxTokens === undefined ? {} : { maxOutputTokens: options.maxTokens }),
    }
  }

  return {
    url: `${joinUrl(
      config.baseUrl,
      `/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent`,
    )}?alt=sse&key=${encodeURIComponent(config.apiKey)}`,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }
}

export function createGeminiLlmProvider(
  config: GeminiLlmProviderConfig,
  transport: GeminiStreamTransport = new FetchGeminiStreamTransport(),
): LLMProvider {
  return {
    providerId: 'google-gemini',
    displayName: 'Google Gemini',

    async *complete(
      messages: readonly ProviderMessage[],
      tools?: readonly ProviderToolDefinition[],
      options?: ProviderCompletionOptions,
    ): AsyncIterable<ProviderStreamEvent> {
      const model = options?.model ?? config.model
      if (model === undefined || model.trim().length === 0) {
        yield { type: 'error', error: 'Google Gemini requires a model' }
        return
      }

      const response = await transport.request(
        buildGeminiRequest(messages, tools, options, config, model),
      )
      if (response.status < 200 || response.status >= 300) {
        yield { type: 'error', error: `Google Gemini returned HTTP ${response.status}` }
        return
      }

      let sawFunctionCall = false
      let finishReason: string | undefined
      let promptTokens = 0
      let candidateTokens = 0
      let fallbackCallIndex = 0

      for await (const line of readSseLines(response.body)) {
        if (!line.startsWith('data:')) continue
        const payload = line.slice('data:'.length).trim()
        if (payload.length === 0) continue

        let chunk: GeminiStreamChunk
        try {
          chunk = JSON.parse(payload) as GeminiStreamChunk
        } catch {
          continue
        }

        if (chunk.usageMetadata !== undefined) {
          promptTokens = chunk.usageMetadata.promptTokenCount ?? promptTokens
          candidateTokens = chunk.usageMetadata.candidatesTokenCount ?? candidateTokens
        }

        const candidate = chunk.candidates?.[0]
        if (candidate === undefined) continue
        if (candidate.finishReason !== undefined) {
          finishReason = candidate.finishReason
        }

        for (const part of candidate.content?.parts ?? []) {
          if (typeof part.text === 'string' && part.text.length > 0) {
            yield { type: 'text_delta', text: part.text }
          }
          if (part.functionCall !== undefined) {
            sawFunctionCall = true
            const id = part.functionCall.id ?? `call_${fallbackCallIndex++}`
            const name = part.functionCall.name
            yield { type: 'tool_use_start', id, name }
            yield { type: 'tool_use_end', id, name, input: part.functionCall.args ?? {} }
          }
        }
      }

      yield {
        type: 'message_stop',
        stopReason: sawFunctionCall
          ? 'tool_use'
          : finishReason === 'MAX_TOKENS'
            ? 'max_tokens'
            : 'end_turn',
        usage: { inputTokens: promptTokens, outputTokens: candidateTokens },
      }
    },
  }
}
