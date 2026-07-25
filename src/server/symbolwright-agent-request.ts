import { SYMBOLWRIGHT_SUPPORTED_PROVIDER_IDS } from '../providers/provider-adapter-contract.js'
import type { SymbolWrightProviderId } from '../providers/provider-adapter-contract.js'
import type { ProviderContentBlock, ProviderMessage } from '../provider/provider.types.js'
import { SYMBOLWRIGHT_RUNTIME_MODES } from '../runtime/policy/runtime-policy.js'
import type { SymbolWrightRuntimeMode } from '../runtime/types.js'
import { ChatRequestValidationError } from './symbolwright-chat-request.js'

const MAX_PRIOR_MESSAGES = 500
const MAX_MESSAGE_TEXT_CHARS = 64_000
const DEFAULT_MAX_ITERATIONS = 25
const MAX_ALLOWED_ITERATIONS = 100

function isSupportedProviderId(value: unknown): value is SymbolWrightProviderId {
  return (
    typeof value === 'string' &&
    (SYMBOLWRIGHT_SUPPORTED_PROVIDER_IDS as readonly string[]).includes(value)
  )
}

function isRuntimeMode(value: unknown): value is SymbolWrightRuntimeMode {
  return (
    typeof value === 'string' && (SYMBOLWRIGHT_RUNTIME_MODES as readonly string[]).includes(value)
  )
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ChatRequestValidationError('Request body must be a JSON object')
  }
  return value as Record<string, unknown>
}

function parseContentBlock(raw: unknown, path: string): ProviderContentBlock {
  const record = asRecord(raw)
  const type = record['type']

  if (type === 'text') {
    if (typeof record['text'] !== 'string') {
      throw new ChatRequestValidationError(`${path}.text must be a string`)
    }
    return { type: 'text', text: record['text'] }
  }

  if (type === 'tool_use') {
    if (typeof record['id'] !== 'string' || typeof record['name'] !== 'string') {
      throw new ChatRequestValidationError(`${path}.id and ${path}.name must be strings`)
    }
    const input = record['input']
    if (typeof input !== 'object' || input === null || Array.isArray(input)) {
      throw new ChatRequestValidationError(`${path}.input must be an object`)
    }
    return {
      type: 'tool_use',
      id: record['id'],
      name: record['name'],
      input: input as Record<string, unknown>,
    }
  }

  if (type === 'tool_result') {
    if (typeof record['toolUseId'] !== 'string' || typeof record['content'] !== 'string') {
      throw new ChatRequestValidationError(`${path}.toolUseId and ${path}.content must be strings`)
    }
    return {
      type: 'tool_result',
      toolUseId: record['toolUseId'],
      content: record['content'],
      ...(record['isError'] === true ? { isError: true } : {}),
    }
  }

  throw new ChatRequestValidationError(`${path}.type must be one of: text, tool_use, tool_result`)
}

function parsePriorMessage(raw: unknown, index: number): ProviderMessage {
  const record = asRecord(raw)
  const role = record['role']
  if (role !== 'user' && role !== 'assistant' && role !== 'tool_use' && role !== 'tool_result') {
    throw new ChatRequestValidationError(
      `priorMessages[${index}].role must be one of: user, assistant, tool_use, tool_result`,
    )
  }

  const content = record['content']
  if (typeof content === 'string') {
    if (content.length > MAX_MESSAGE_TEXT_CHARS) {
      throw new ChatRequestValidationError(
        `priorMessages[${index}].content must not exceed ${MAX_MESSAGE_TEXT_CHARS} characters`,
      )
    }
    return { role, content }
  }

  if (Array.isArray(content)) {
    return {
      role,
      content: content.map((block, blockIndex) =>
        parseContentBlock(block, `priorMessages[${index}].content[${blockIndex}]`),
      ),
    }
  }

  throw new ChatRequestValidationError(`priorMessages[${index}].content must be a string or array`)
}

function parsePriorMessages(raw: unknown): readonly ProviderMessage[] | undefined {
  if (raw === undefined) return undefined
  if (!Array.isArray(raw)) {
    throw new ChatRequestValidationError('priorMessages must be an array')
  }
  if (raw.length > MAX_PRIOR_MESSAGES) {
    throw new ChatRequestValidationError(
      `priorMessages must not exceed ${MAX_PRIOR_MESSAGES} entries`,
    )
  }
  return raw.map((entry, index) => parsePriorMessage(entry, index))
}

export interface ParsedAgentRequest {
  readonly providerId: SymbolWrightProviderId
  readonly model?: string
  readonly systemPrompt?: string
  readonly mode: SymbolWrightRuntimeMode
  readonly missionId?: string
  readonly message: string
  readonly priorMessages?: readonly ProviderMessage[]
  readonly maxIterations: number
  readonly temperature?: number
  readonly maxTokens?: number
  readonly stream: boolean
}

export function parseAgentRequestBody(raw: unknown): ParsedAgentRequest {
  const body = asRecord(raw)

  const providerId = body['providerId'] ?? body['provider']
  if (!isSupportedProviderId(providerId)) {
    throw new ChatRequestValidationError(
      `providerId must be one of: ${SYMBOLWRIGHT_SUPPORTED_PROVIDER_IDS.join(', ')}`,
    )
  }

  const message = body['message']
  if (typeof message !== 'string' || message.trim().length === 0) {
    throw new ChatRequestValidationError('message must be a non-empty string')
  }
  if (message.length > MAX_MESSAGE_TEXT_CHARS) {
    throw new ChatRequestValidationError(
      `message must not exceed ${MAX_MESSAGE_TEXT_CHARS} characters`,
    )
  }

  const modeRaw = body['mode']
  if (modeRaw !== undefined && !isRuntimeMode(modeRaw)) {
    throw new ChatRequestValidationError(
      `mode must be one of: ${SYMBOLWRIGHT_RUNTIME_MODES.join(', ')}`,
    )
  }

  const model = body['model']
  const systemPrompt = body['systemPrompt']
  const missionId = body['missionId']
  const temperature = body['temperature']
  const maxTokens = body['maxTokens']
  const maxIterationsRaw = body['maxIterations']
  const stream = body['stream']

  if (model !== undefined && typeof model !== 'string') {
    throw new ChatRequestValidationError('model must be a string')
  }
  if (systemPrompt !== undefined && typeof systemPrompt !== 'string') {
    throw new ChatRequestValidationError('systemPrompt must be a string')
  }
  if (
    missionId !== undefined &&
    (typeof missionId !== 'string' || missionId.trim().length === 0 || missionId.length > 200)
  ) {
    throw new ChatRequestValidationError(
      'missionId must be a non-empty string of at most 200 characters',
    )
  }
  if (temperature !== undefined && typeof temperature !== 'number') {
    throw new ChatRequestValidationError('temperature must be a number')
  }
  if (maxTokens !== undefined && typeof maxTokens !== 'number') {
    throw new ChatRequestValidationError('maxTokens must be a number')
  }
  if (
    maxIterationsRaw !== undefined &&
    (typeof maxIterationsRaw !== 'number' ||
      maxIterationsRaw < 1 ||
      maxIterationsRaw > MAX_ALLOWED_ITERATIONS)
  ) {
    throw new ChatRequestValidationError(
      `maxIterations must be a number between 1 and ${MAX_ALLOWED_ITERATIONS}`,
    )
  }

  const priorMessages = parsePriorMessages(body['priorMessages'])

  return {
    providerId,
    ...(typeof model === 'string' ? { model } : {}),
    ...(typeof systemPrompt === 'string' ? { systemPrompt } : {}),
    mode: isRuntimeMode(modeRaw) ? modeRaw : 'READ_ONLY',
    ...(typeof missionId === 'string' ? { missionId: missionId.trim() } : {}),
    message,
    ...(priorMessages === undefined ? {} : { priorMessages }),
    maxIterations: typeof maxIterationsRaw === 'number' ? maxIterationsRaw : DEFAULT_MAX_ITERATIONS,
    ...(typeof temperature === 'number' ? { temperature } : {}),
    ...(typeof maxTokens === 'number' ? { maxTokens } : {}),
    stream: stream !== false,
  }
}
