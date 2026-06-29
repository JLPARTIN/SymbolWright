import type { CodemindProviderId } from './provider-adapter-contract.js'

export type ProviderGatewayErrorCode =
  | 'UNKNOWN_PROVIDER'
  | 'PROVIDER_DISABLED'
  | 'MISSING_CREDENTIALS'
  | 'MISSING_MODEL'
  | 'HTTP_ERROR'
  | 'INVALID_RESPONSE'
  | 'NO_AVAILABLE_PROVIDER'

export class ProviderGatewayError extends Error {
  public readonly code: ProviderGatewayErrorCode
  public readonly providerId?: CodemindProviderId
  public readonly status?: number

  public constructor(
    code: ProviderGatewayErrorCode,
    message: string,
    options: { readonly providerId?: CodemindProviderId; readonly status?: number } = {},
  ) {
    super(message)
    this.name = 'ProviderGatewayError'
    this.code = code
    this.providerId = options.providerId
    this.status = options.status
  }
}

export function normalizeProviderGatewayError(error: unknown): ProviderGatewayError {
  if (error instanceof ProviderGatewayError) {
    return error
  }

  if (error instanceof Error) {
    return new ProviderGatewayError('HTTP_ERROR', error.message)
  }

  return new ProviderGatewayError('HTTP_ERROR', 'Unknown provider gateway error')
}
