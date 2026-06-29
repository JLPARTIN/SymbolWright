export {
  CODEMIND_PROVIDER_ADAPTERS,
  CODEMIND_PROVIDER_ADAPTER_BLOCK_ID,
  CODEMIND_PROVIDER_CAPABILITIES,
  CODEMIND_PROVIDER_ENDPOINT_OWNERSHIP_MODES,
  CODEMIND_PROVIDER_KEY_HANDLING_MODES,
  CODEMIND_SUPPORTED_PROVIDER_IDS,
  assertProviderKeyNeverLeavesServer,
  buildProviderAdapterContractReport,
  findCodemindProviderAdapter,
  getCodemindProviderAdapterRegistry,
  renderProviderAdapterContractReport,
} from './provider-adapter-contract.js'
export type {
  CodemindProviderAdapterContract,
  CodemindProviderAdapterContractReport,
  CodemindProviderAdapterSecurityCheck,
  CodemindProviderCapability,
  CodemindProviderEndpointOwnership,
  CodemindProviderId,
  CodemindProviderKeyHandling,
} from './provider-adapter-contract.js'

export { loadProviderGatewayConfig, parseProviderId, parseProviderList } from './provider-config.js'
export type { ProviderGatewayEnv } from './provider-config.js'

export { ProviderGatewayError, normalizeProviderGatewayError } from './provider-errors.js'
export type { ProviderGatewayErrorCode } from './provider-errors.js'

export { FetchProviderHttpTransport } from './provider-http-transport.js'
export { ProviderGateway, runProviderGatewayRequest } from './provider-gateway.js'
export type { ProviderGatewayOptions } from './provider-gateway.js'

export {
  redactProviderGatewayConfig,
  redactProviderSecret,
  redactProviderText,
} from './provider-redaction.js'

export { PROVIDER_GATEWAY_ADAPTERS, findProviderGatewayAdapter } from './provider-adapters.js'

export type {
  ProviderAdapterHttpPlan,
  ProviderGatewayAdapter,
  ProviderGatewayConfig,
  ProviderGatewayMessage,
  ProviderGatewayRequest,
  ProviderGatewayResponse,
  ProviderGatewayResponseFormat,
  ProviderGatewayRole,
  ProviderGatewayStatus,
  ProviderGatewayUsage,
  ProviderHttpRequest,
  ProviderHttpResponse,
  ProviderHttpTransport,
  ProviderResolvedConfig,
  ProviderStatusReport,
  RedactedProviderConfig,
  RedactedProviderGatewayConfig,
} from './provider-gateway.types.js'
