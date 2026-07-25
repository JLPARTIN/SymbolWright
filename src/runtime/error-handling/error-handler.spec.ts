import { describe, expect, it } from 'vitest'

import {
  classifyError,
  computeRetryDelay,
  shouldRetry,
  withRetry,
  formatErrorForUser,
  formatErrorForLLM,
  isProviderStreamError,
} from './error-handler.js'
import type { SymbolWrightError, RetryConfig } from './error-handler.js'
import type { ProviderStreamEvent } from '../../provider/provider.types.js'

describe('classifyError', () => {
  it('classifies authentication errors', () => {
    const err = classifyError(new Error('Invalid API key'))
    expect(err.category).toBe('provider_error')
    expect(err.retryable).toBe(false)
  })

  it('classifies rate limit errors as retryable', () => {
    const err = classifyError(new Error('Rate limit exceeded (429)'))
    expect(err.category).toBe('provider_error')
    expect(err.retryable).toBe(true)
  })

  it('classifies overloaded errors as retryable', () => {
    const err = classifyError(new Error('Server overloaded 529'))
    expect(err.category).toBe('provider_error')
    expect(err.retryable).toBe(true)
  })

  it('classifies timeout errors as network', () => {
    const err = classifyError(new Error('Request timeout'))
    expect(err.category).toBe('network_error')
    expect(err.retryable).toBe(true)
  })

  it('classifies permission errors', () => {
    const err = classifyError(new Error('Permission denied for file write'))
    expect(err.category).toBe('permission_denied')
    expect(err.retryable).toBe(false)
  })

  it('classifies context overflow', () => {
    const err = classifyError(new Error('Context window too long'))
    expect(err.category).toBe('context_overflow')
    expect(err.retryable).toBe(false)
  })

  it('classifies swarm errors', () => {
    const err = classifyError(new Error('Swarm agent failed'))
    expect(err.category).toBe('swarm_error')
    expect(err.retryable).toBe(true)
  })

  it('classifies unknown errors', () => {
    const err = classifyError(new Error('Something weird happened'))
    expect(err.category).toBe('unknown_error')
    expect(err.retryable).toBe(false)
  })

  it('handles non-Error values', () => {
    const err = classifyError('string error')
    expect(err.category).toBe('unknown_error')
    expect(err.message).toBe('string error')
  })

  it('preserves original error', () => {
    const original = new Error('test')
    const err = classifyError(original)
    expect(err.originalError).toBe(original)
  })
})

describe('computeRetryDelay', () => {
  const config: RetryConfig = { maxRetries: 3, baseDelayMs: 100, maxDelayMs: 1600 }

  it('computes exponential backoff', () => {
    expect(computeRetryDelay(0, config)).toBe(100)
    expect(computeRetryDelay(1, config)).toBe(200)
    expect(computeRetryDelay(2, config)).toBe(400)
  })

  it('caps at maxDelayMs', () => {
    expect(computeRetryDelay(10, config)).toBe(1600)
  })
})

describe('shouldRetry', () => {
  const config: RetryConfig = { maxRetries: 3, baseDelayMs: 100, maxDelayMs: 1600 }

  it('returns true for retryable error within attempts', () => {
    const err: SymbolWrightError = {
      category: 'network_error',
      message: 'timeout',
      retryable: true,
    }
    expect(shouldRetry(err, 0, config)).toBe(true)
    expect(shouldRetry(err, 2, config)).toBe(true)
  })

  it('returns false when attempts exhausted', () => {
    const err: SymbolWrightError = {
      category: 'network_error',
      message: 'timeout',
      retryable: true,
    }
    expect(shouldRetry(err, 3, config)).toBe(false)
  })

  it('returns false for non-retryable error', () => {
    const err: SymbolWrightError = {
      category: 'permission_denied',
      message: 'denied',
      retryable: false,
    }
    expect(shouldRetry(err, 0, config)).toBe(false)
  })
})

describe('withRetry', () => {
  it('returns result on first success', async () => {
    const result = await withRetry(async () => 42)
    expect(result).toBe(42)
  })

  it('retries on retryable error', async () => {
    let attempts = 0
    const result = await withRetry(
      async () => {
        attempts++
        if (attempts < 3) throw new Error('Rate limit exceeded (429)')
        return 'success'
      },
      { maxRetries: 3, baseDelayMs: 1, maxDelayMs: 10 },
    )

    expect(result).toBe('success')
    expect(attempts).toBe(3)
  })

  it('throws on non-retryable error', async () => {
    await expect(
      withRetry(
        async () => {
          throw new Error('Invalid API key')
        },
        { maxRetries: 3, baseDelayMs: 1, maxDelayMs: 10 },
      ),
    ).rejects.toThrow('Invalid API key')
  })

  it('throws after retries exhausted', async () => {
    await expect(
      withRetry(
        async () => {
          throw new Error('Rate limit exceeded (429)')
        },
        { maxRetries: 2, baseDelayMs: 1, maxDelayMs: 10 },
      ),
    ).rejects.toThrow()
  })
})

describe('formatErrorForUser', () => {
  it('formats provider error', () => {
    const msg = formatErrorForUser({
      category: 'provider_error',
      message: 'key invalid',
      retryable: false,
    })
    expect(msg).toContain('Provider error')
  })

  it('formats retryable provider error', () => {
    const msg = formatErrorForUser({
      category: 'provider_error',
      message: 'rate limited',
      retryable: true,
    })
    expect(msg).toContain('temporarily unavailable')
  })

  it('formats permission denied', () => {
    const msg = formatErrorForUser({
      category: 'permission_denied',
      message: 'blocked',
      retryable: false,
    })
    expect(msg).toContain('governance policy')
  })

  it('formats context overflow', () => {
    const msg = formatErrorForUser({
      category: 'context_overflow',
      message: 'too long',
      retryable: false,
    })
    expect(msg).toContain('compacted')
  })

  it('formats swarm error', () => {
    const msg = formatErrorForUser({ category: 'swarm_error', message: 'failed', retryable: true })
    expect(msg).toContain('Swarm agent')
  })
})

describe('formatErrorForLLM', () => {
  it('includes tool name when provided', () => {
    const msg = formatErrorForLLM(
      { category: 'tool_error', message: 'not found', retryable: false },
      'read_file',
    )
    expect(msg).toContain('read_file')
  })

  it('includes recovery suggestion', () => {
    const msg = formatErrorForLLM({
      category: 'permission_denied',
      message: 'denied',
      retryable: false,
    })
    expect(msg).toContain('approval')
  })
})

describe('isProviderStreamError', () => {
  it('returns true for error events', () => {
    const event: ProviderStreamEvent = { type: 'error', error: 'fail' }
    expect(isProviderStreamError(event)).toBe(true)
  })

  it('returns false for non-error events', () => {
    const event: ProviderStreamEvent = { type: 'text_delta', text: 'hi' }
    expect(isProviderStreamError(event)).toBe(false)
  })
})
