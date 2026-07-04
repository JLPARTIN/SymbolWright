import type {
  LLMProvider,
  ProviderCompletionOptions,
  ProviderContentBlock,
  ProviderMessage,
  ProviderStreamEvent,
  ProviderToolDefinition,
} from './provider.types.js'

const DEFAULT_MAX_TOKENS = 8192

export interface OpenAiCompatibleLlmProviderConfig {
  /** Used only for `providerId`/`displayName` on the returned LLMProvider; does not affect the wire format. */
  readonly providerId: string
  readonly displayName: string
  readonly baseUrl: string
  readonly apiKey?: string
  readonly model?: string
  readonly maxTokens?: number
}

export interface OpenAiCompatibleStreamHttpRequest {
  readonly url: string
  readonly headers: Readonly<Record<string, string>>
  readonly body: string
}

export interface OpenAiCompatibleStreamHttpResponse {
  readonly status: number
  readonly body: AsyncIterable<string>
}

/**
 * Every "OpenAI-compatible" provider (OpenAI, Groq, OpenRouter, GitHub
 * Models, Ollama, DeepSeek, and any `custom` endpoint that mirrors this API)
 * shares one streaming tool-calling wire format, so one transport +
 * implementation covers all of them.
 */
export interface OpenAiCompatibleStreamTransport {
  request(req: OpenAiCompatibleStreamHttpRequest): Promise<OpenAiCompatibleStreamHttpResponse>
}

export class FetchOpenAiCompatibleStreamTransport implements OpenAiCompatibleStreamTransport {
  public async request(
    req: OpenAiCompatibleStreamHttpRequest,
  ): Promise<OpenAiCompatibleStreamHttpResponse> {
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

interface OpenAiToolCallDelta {
  readonly index: number
  readonly id?: string
  readonly function?: { readonly name?: string; readonly arguments?: string }
}

interface OpenAiStreamChunk {
  readonly choices?: readonly {
    readonly delta?: {
      readonly content?: string
      readonly tool_calls?: readonly OpenAiToolCallDelta[]
    }
    readonly finish_reason?: string | null
  }[]
  readonly usage?: { readonly prompt_tokens?: number; readonly completion_tokens?: number }
}

function toOpenAiTools(tools: readonly ProviderToolDefinition[]): readonly unknown[] {
  return tools.map((tool) => ({
    type: 'function',
    function: { name: tool.name, description: tool.description, parameters: tool.inputSchema },
  }))
}

function assistantContentBlocksToOpenAi(blocks: readonly ProviderContentBlock[]): {
  readonly content: string | null
  readonly tool_calls?: readonly unknown[]
} {
  const text = blocks
    .filter(
      (block): block is Extract<ProviderContentBlock, { type: 'text' }> => block.type === 'text',
    )
    .map((block) => block.text)
    .join('')
  const toolUseBlocks = blocks.filter(
    (block): block is Extract<ProviderContentBlock, { type: 'tool_use' }> =>
      block.type === 'tool_use',
  )

  return {
    content: text.length > 0 ? text : null,
    ...(toolUseBlocks.length > 0
      ? {
          tool_calls: toolUseBlocks.map((block) => ({
            id: block.id,
            type: 'function',
            function: { name: block.name, arguments: JSON.stringify(block.input) },
          })),
        }
      : {}),
  }
}

function toOpenAiMessages(
  messages: readonly ProviderMessage[],
  systemPrompt: string | undefined,
): unknown[] {
  const out: unknown[] = []
  if (systemPrompt !== undefined && systemPrompt.trim().length > 0) {
    out.push({ role: 'system', content: systemPrompt })
  }

  for (const message of messages) {
    if (typeof message.content === 'string') {
      out.push({
        role: message.role === 'assistant' ? 'assistant' : 'user',
        content: message.content,
      })
      continue
    }

    if (message.role === 'tool_result') {
      for (const block of message.content) {
        if (block.type === 'tool_result') {
          out.push({ role: 'tool', tool_call_id: block.toolUseId, content: block.content })
        }
      }
      continue
    }

    out.push({ role: 'assistant', ...assistantContentBlocksToOpenAi(message.content) })
  }

  return out
}

function mapFinishReason(finishReason: string | undefined): 'end_turn' | 'tool_use' | 'max_tokens' {
  if (finishReason === 'tool_calls') return 'tool_use'
  if (finishReason === 'length') return 'max_tokens'
  return 'end_turn'
}

interface ToolCallAccumulator {
  id?: string
  name?: string
  arguments: string
  started: boolean
}

export function createOpenAiCompatibleLlmProvider(
  config: OpenAiCompatibleLlmProviderConfig,
  transport: OpenAiCompatibleStreamTransport = new FetchOpenAiCompatibleStreamTransport(),
): LLMProvider {
  const defaultMaxTokens = config.maxTokens ?? DEFAULT_MAX_TOKENS

  return {
    providerId: config.providerId,
    displayName: config.displayName,

    async *complete(
      messages: readonly ProviderMessage[],
      tools?: readonly ProviderToolDefinition[],
      options?: ProviderCompletionOptions,
    ): AsyncIterable<ProviderStreamEvent> {
      const model = options?.model ?? config.model
      if (model === undefined || model.trim().length === 0) {
        yield { type: 'error', error: `${config.displayName} requires a model` }
        return
      }

      const headers: Record<string, string> = { 'content-type': 'application/json' }
      if (config.apiKey !== undefined) {
        headers['authorization'] = `Bearer ${config.apiKey}`
      }

      const body: Record<string, unknown> = {
        model,
        messages: toOpenAiMessages(messages, options?.systemPrompt),
        stream: true,
        stream_options: { include_usage: true },
        max_tokens: options?.maxTokens ?? defaultMaxTokens,
      }
      if (tools !== undefined && tools.length > 0) {
        body['tools'] = toOpenAiTools(tools)
      }
      if (options?.temperature !== undefined) {
        body['temperature'] = options.temperature
      }
      if (options?.stopSequences !== undefined && options.stopSequences.length > 0) {
        body['stop'] = [...options.stopSequences]
      }

      const response = await transport.request({
        url: joinUrl(config.baseUrl, '/chat/completions'),
        headers,
        body: JSON.stringify(body),
      })

      if (response.status < 200 || response.status >= 300) {
        yield { type: 'error', error: `${config.displayName} returned HTTP ${response.status}` }
        return
      }

      const toolCalls = new Map<number, ToolCallAccumulator>()
      let finishReason: string | undefined
      let inputTokens = 0
      let outputTokens = 0

      for await (const line of readSseLines(response.body)) {
        if (!line.startsWith('data:')) continue
        const payload = line.slice('data:'.length).trim()
        if (payload.length === 0 || payload === '[DONE]') continue

        let chunk: OpenAiStreamChunk
        try {
          chunk = JSON.parse(payload) as OpenAiStreamChunk
        } catch {
          continue
        }

        if (chunk.usage !== undefined) {
          inputTokens = chunk.usage.prompt_tokens ?? inputTokens
          outputTokens = chunk.usage.completion_tokens ?? outputTokens
        }

        const choice = chunk.choices?.[0]
        if (choice === undefined) continue

        if (choice.finish_reason !== null && choice.finish_reason !== undefined) {
          finishReason = choice.finish_reason
        }

        if (choice.delta?.content !== undefined && choice.delta.content.length > 0) {
          yield { type: 'text_delta', text: choice.delta.content }
        }

        for (const toolCallDelta of choice.delta?.tool_calls ?? []) {
          let accumulator = toolCalls.get(toolCallDelta.index)
          if (accumulator === undefined) {
            accumulator = { arguments: '', started: false }
            toolCalls.set(toolCallDelta.index, accumulator)
          }
          if (toolCallDelta.id !== undefined) accumulator.id = toolCallDelta.id
          if (toolCallDelta.function?.name !== undefined)
            accumulator.name = toolCallDelta.function.name
          if (toolCallDelta.function?.arguments !== undefined) {
            accumulator.arguments += toolCallDelta.function.arguments
            yield { type: 'tool_use_delta', partialJson: toolCallDelta.function.arguments }
          }
          if (
            !accumulator.started &&
            accumulator.id !== undefined &&
            accumulator.name !== undefined
          ) {
            accumulator.started = true
            yield { type: 'tool_use_start', id: accumulator.id, name: accumulator.name }
          }
        }
      }

      for (const [, accumulator] of [...toolCalls].sort(([a], [b]) => a - b)) {
        if (accumulator.id === undefined || accumulator.name === undefined) continue
        let input: Record<string, unknown> = {}
        try {
          input = accumulator.arguments.length > 0 ? JSON.parse(accumulator.arguments) : {}
        } catch {
          input = {}
        }
        yield { type: 'tool_use_end', id: accumulator.id, name: accumulator.name, input }
      }

      yield {
        type: 'message_stop',
        stopReason: mapFinishReason(finishReason),
        usage: { inputTokens, outputTokens },
      }
    },
  }
}
