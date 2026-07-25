import { SYMBOLWRIGHT_SUPPORTED_PROVIDER_IDS } from '../providers/provider-adapter-contract.js'
import type { SymbolWrightProviderId } from '../providers/provider-adapter-contract.js'
import type {
  ProviderGatewayMessage,
  ProviderGatewayRole,
} from '../providers/provider-gateway.types.js'
import type { ProviderRuntimeOverrideInput } from '../providers/provider-runtime-overrides.js'

export class ChatRequestValidationError extends Error {}

const MESSAGE_ROLES: readonly ProviderGatewayRole[] = ['system', 'user', 'assistant']
const MAX_MESSAGES = 200
const MAX_MESSAGE_CHARS = 32_000

function isSupportedProviderId(value: unknown): value is SymbolWrightProviderId {
  return (
    typeof value === 'string' &&
    (SYMBOLWRIGHT_SUPPORTED_PROVIDER_IDS as readonly string[]).includes(value)
  )
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ChatRequestValidationError('Request body must be a JSON object')
  }
  return value as Record<string, unknown>
}

export function resolveRequestedProviderId(body: Record<string, unknown>): SymbolWrightProviderId {
  const candidate = body['providerId'] ?? body['provider']
  if (!isSupportedProviderId(candidate)) {
    throw new ChatRequestValidationError(
      `providerId must be one of: ${SYMBOLWRIGHT_SUPPORTED_PROVIDER_IDS.join(', ')}`,
    )
  }
  return candidate
}

export interface ParsedChatRequest {
  readonly providerId: SymbolWrightProviderId
  readonly model?: string
  readonly systemPrompt?: string
  readonly messages: readonly ProviderGatewayMessage[]
  readonly temperature?: number
  readonly maxTokens?: number
  readonly stream: boolean
}

function parseMessages(raw: unknown): readonly ProviderGatewayMessage[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new ChatRequestValidationError('messages must be a non-empty array')
  }
  if (raw.length > MAX_MESSAGES) {
    throw new ChatRequestValidationError(`messages must not exceed ${MAX_MESSAGES} entries`)
  }

  return raw.map((entry, index) => {
    const record = asRecord(entry)
    const role = record['role']
    const content = record['content']

    if (typeof role !== 'string' || !MESSAGE_ROLES.includes(role as ProviderGatewayRole)) {
      throw new ChatRequestValidationError(
        `messages[${index}].role must be one of: ${MESSAGE_ROLES.join(', ')}`,
      )
    }
    if (typeof content !== 'string' || content.length === 0) {
      throw new ChatRequestValidationError(`messages[${index}].content must be a non-empty string`)
    }
    if (content.length > MAX_MESSAGE_CHARS) {
      throw new ChatRequestValidationError(
        `messages[${index}].content must not exceed ${MAX_MESSAGE_CHARS} characters`,
      )
    }

    return { role: role as ProviderGatewayRole, content }
  })
}

export function parseChatRequestBody(raw: unknown): ParsedChatRequest {
  const body = asRecord(raw)
  const providerId = resolveRequestedProviderId(body)
  const messages = parseMessages(body['messages'])

  const model = body['model']
  const systemPrompt = body['systemPrompt']
  const temperature = body['temperature']
  const maxTokens = body['maxTokens']
  const stream = body['stream']

  if (model !== undefined && typeof model !== 'string') {
    throw new ChatRequestValidationError('model must be a string')
  }
  if (systemPrompt !== undefined && typeof systemPrompt !== 'string') {
    throw new ChatRequestValidationError('systemPrompt must be a string')
  }
  if (temperature !== undefined && typeof temperature !== 'number') {
    throw new ChatRequestValidationError('temperature must be a number')
  }
  if (maxTokens !== undefined && typeof maxTokens !== 'number') {
    throw new ChatRequestValidationError('maxTokens must be a number')
  }

  return {
    providerId,
    ...(typeof model === 'string' ? { model } : {}),
    ...(typeof systemPrompt === 'string' ? { systemPrompt } : {}),
    messages,
    ...(typeof temperature === 'number' ? { temperature } : {}),
    ...(typeof maxTokens === 'number' ? { maxTokens } : {}),
    stream: stream === true,
  }
}

export interface ParsedRegisterRequest {
  readonly providerId: string
  readonly override: ProviderRuntimeOverrideInput
}

export function parseRegisterRequestBody(raw: unknown): ParsedRegisterRequest {
  const body = asRecord(raw)
  const providerId = body['providerId'] ?? body['provider']
  if (typeof providerId !== 'string' || providerId.trim().length === 0) {
    throw new ChatRequestValidationError('providerId is required')
  }

  const baseUrl = body['baseUrl']
  const apiKey = body['apiKey']
  const model = body['model']
  const displayName = body['displayName']
  const enabled = body['enabled']

  if (baseUrl !== undefined && typeof baseUrl !== 'string') {
    throw new ChatRequestValidationError('baseUrl must be a string')
  }
  if (apiKey !== undefined && typeof apiKey !== 'string') {
    throw new ChatRequestValidationError('apiKey must be a string')
  }
  if (model !== undefined && typeof model !== 'string') {
    throw new ChatRequestValidationError('model must be a string')
  }
  if (displayName !== undefined && typeof displayName !== 'string') {
    throw new ChatRequestValidationError('displayName must be a string')
  }
  if (enabled !== undefined && typeof enabled !== 'boolean') {
    throw new ChatRequestValidationError('enabled must be a boolean')
  }

  return {
    providerId,
    override: {
      ...(typeof baseUrl === 'string' ? { baseUrl } : {}),
      ...(typeof apiKey === 'string' ? { apiKey } : {}),
      ...(typeof model === 'string' ? { model } : {}),
      ...(typeof displayName === 'string' ? { displayName } : {}),
      ...(typeof enabled === 'boolean' ? { enabled } : {}),
    },
  }
}

export function parseResetRequestBody(raw: unknown): { readonly providerId: string } {
  const body = asRecord(raw)
  const providerId = body['providerId'] ?? body['provider']
  if (typeof providerId !== 'string' || providerId.trim().length === 0) {
    throw new ChatRequestValidationError('providerId is required')
  }
  return { providerId }
}
