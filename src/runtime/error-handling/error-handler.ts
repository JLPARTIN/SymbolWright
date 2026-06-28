import type { ProviderStreamEvent } from '../../provider/provider.types.js'

/** Categorization of errors for routing recovery and user messaging. */
export type CodemindErrorCategory =
  | 'provider_error'
  | 'tool_error'
  | 'permission_denied'
  | 'context_overflow'
  | 'swarm_error'
  | 'network_error'
  | 'unknown_error'

/** Structured error with category, retryability, and original context. */
export interface CodemindError {
  readonly category: CodemindErrorCategory
  readonly message: string
  readonly retryable: boolean
  readonly originalError?: unknown
  readonly context?: Record<string, unknown>
}

export interface RetryConfig {
  readonly maxRetries: number
  readonly baseDelayMs: number
  readonly maxDelayMs: number
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 16000,
}

/** Classifies a raw error into a CodemindError with category and retryability. */
export function classifyError(error: unknown): CodemindError {
  if (error instanceof Error) {
    const msg = error.message.toLowerCase()

    if (msg.includes('api key') || msg.includes('authentication') || msg.includes('unauthorized')) {
      return {
        category: 'provider_error',
        message: `Provider authentication failed: ${error.message}`,
        retryable: false,
        originalError: error,
      }
    }

    if (msg.includes('rate limit') || msg.includes('429') || msg.includes('too many requests')) {
      return {
        category: 'provider_error',
        message: `Provider rate limited: ${error.message}`,
        retryable: true,
        originalError: error,
      }
    }

    if (msg.includes('overloaded') || msg.includes('503') || msg.includes('529')) {
      return {
        category: 'provider_error',
        message: `Provider overloaded: ${error.message}`,
        retryable: true,
        originalError: error,
      }
    }

    if (msg.includes('timeout') || msg.includes('etimedout') || msg.includes('econnreset')) {
      return {
        category: 'network_error',
        message: `Network error: ${error.message}`,
        retryable: true,
        originalError: error,
      }
    }

    if (msg.includes('permission') || msg.includes('denied') || msg.includes('forbidden')) {
      return {
        category: 'permission_denied',
        message: `Permission denied: ${error.message}`,
        retryable: false,
        originalError: error,
      }
    }

    if (
      msg.includes('context') &&
      (msg.includes('overflow') || msg.includes('too long') || msg.includes('exceed'))
    ) {
      return {
        category: 'context_overflow',
        message: `Context window exceeded: ${error.message}`,
        retryable: false,
        originalError: error,
      }
    }

    if (msg.includes('swarm') || msg.includes('agent dispatch')) {
      return {
        category: 'swarm_error',
        message: `Swarm agent error: ${error.message}`,
        retryable: true,
        originalError: error,
      }
    }
  }

  const message = error instanceof Error ? error.message : String(error)
  return {
    category: 'unknown_error',
    message,
    retryable: false,
    originalError: error,
  }
}

/** Computes exponential backoff delay for the given retry attempt. */
export function computeRetryDelay(
  attempt: number,
  config: RetryConfig = DEFAULT_RETRY_CONFIG,
): number {
  const delay = config.baseDelayMs * Math.pow(2, attempt)
  return Math.min(delay, config.maxDelayMs)
}

/** Returns true if the error is retryable and attempts remain. */
export function shouldRetry(
  error: CodemindError,
  attempt: number,
  config: RetryConfig = DEFAULT_RETRY_CONFIG,
): boolean {
  return error.retryable && attempt < config.maxRetries
}

/** Retries an async function with exponential backoff on retryable errors. */
export async function withRetry<T>(
  fn: () => Promise<T>,
  config: RetryConfig = DEFAULT_RETRY_CONFIG,
): Promise<T> {
  let lastError: CodemindError | undefined

  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      return await fn()
    } catch (raw: unknown) {
      lastError = classifyError(raw)

      if (!shouldRetry(lastError, attempt, config)) {
        throw raw
      }

      const delay = computeRetryDelay(attempt, config)
      await sleep(delay)
    }
  }

  throw lastError?.originalError ?? new Error(lastError?.message ?? 'Retry exhausted')
}

/** Formats a CodemindError into a user-facing message. */
export function formatErrorForUser(error: CodemindError): string {
  switch (error.category) {
    case 'provider_error':
      return error.retryable
        ? `Provider temporarily unavailable. ${error.message}`
        : `Provider error: ${error.message}. Check your API key and configuration.`

    case 'tool_error':
      return `Tool execution failed: ${error.message}`

    case 'permission_denied':
      return `Action blocked by governance policy: ${error.message}`

    case 'context_overflow':
      return `Conversation too long. Context will be compacted automatically.`

    case 'swarm_error':
      return `Swarm agent encountered an error: ${error.message}. The orchestrator will reassign if possible.`

    case 'network_error':
      return `Network connectivity issue: ${error.message}. Will retry automatically.`

    case 'unknown_error':
      return `Unexpected error: ${error.message}`
  }
}

/** Formats a CodemindError into a message suitable for the LLM context. */
export function formatErrorForLLM(error: CodemindError, toolName?: string): string {
  const prefix = toolName !== undefined ? `Tool "${toolName}" failed: ` : ''
  return `${prefix}${error.message}. ${suggestRecovery(error)}`
}

function suggestRecovery(error: CodemindError): string {
  switch (error.category) {
    case 'tool_error':
      return 'Try an alternative approach or different tool.'
    case 'permission_denied':
      return 'This action requires operator approval. Explain what you need to do and why.'
    case 'context_overflow':
      return 'Reduce context by summarizing earlier work.'
    case 'swarm_error':
      return 'Consider handling this task directly instead of delegating.'
    case 'network_error':
      return 'Wait briefly and retry.'
    default:
      return 'Report this to the operator.'
  }
}

/** Returns true if the provider stream event is an error event. */
export function isProviderStreamError(event: ProviderStreamEvent): boolean {
  return event.type === 'error'
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
