export {
  CODETELLIGENCE_CLI_NAME,
  CODETELLIGENCE_ENV_PREFIX,
  CODETELLIGENCE_MCP_SERVER_NAME,
  CODETELLIGENCE_PACKAGE_NAME,
  CODETELLIGENCE_PLATFORM_NAME,
  CODETELLIGENCE_REPOSITORY_NAME,
  CODETELLIGENCE_STORAGE_DIRECTORY,
  CODETELLIGENCE_WORKSPACE_CLI_NAME,
  codetelligenceEnvironmentVariable,
  readBrandEnvironmentValue,
  renderLegacyEnvironmentWarning,
} from './brand/identity.js'
export type { BrandEnvironmentSource, BrandEnvironmentValue } from './brand/identity.js'

export {
  CODETELLIGENCE_AJNA_CAPABILITY_NAME,
  getCodetelligenceFoundationSnapshot,
} from './codemind-foundation.js'
export type {
  CodetelligenceFoundationSnapshot,
  CodetelligenceRuntimePosture,
} from './codemind-foundation.js'

export {
  resolveCodetelligenceConfig,
  validateCodetelligenceConfig,
} from './config/codemind-config.js'
export type {
  CodetelligenceConfig,
  CodetelligenceConfigSources,
  CodetelligenceConfigValidationResult,
} from './config/codemind-config.js'

export { runCodetelligenceMcpServer } from './mcp/mcp-server.js'
