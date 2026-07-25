import { loadProviderGatewayConfig } from './providers/provider-config.js'
import { ProviderGateway } from './providers/provider-gateway.js'
import { redactProviderGatewayConfig } from './providers/provider-redaction.js'

export type ProviderCliSubcommand = 'list' | 'status' | 'health' | 'models'

function resolveSubcommand(args: readonly string[]): ProviderCliSubcommand {
  const subcommand = args[0]

  if (
    subcommand === undefined ||
    subcommand === 'list' ||
    subcommand === 'status' ||
    subcommand === 'health' ||
    subcommand === 'models'
  ) {
    return subcommand ?? 'list'
  }

  throw new Error(`Unknown providers subcommand: ${subcommand}`)
}

export function renderProvidersCommand(args: readonly string[] = []): string {
  const subcommand = resolveSubcommand(args)
  const config = loadProviderGatewayConfig()
  const gateway = new ProviderGateway({ config })
  const redacted = redactProviderGatewayConfig(config)
  const statuses = gateway.getProviderStatuses()

  if (subcommand === 'models') {
    return [
      'SymbolWright Provider Models',
      '',
      ...redacted.providers.map(
        (provider) => `  ${provider.id.padEnd(14)} ${provider.defaultModel ?? 'not configured'}`,
      ),
    ].join('\n')
  }

  if (subcommand === 'health' || subcommand === 'status') {
    return [
      'SymbolWright Provider Status',
      '',
      `Active provider: ${redacted.activeProvider ?? 'not configured'}`,
      `Active model:    ${redacted.activeModel ?? 'provider default'}`,
      `Fallbacks:       ${
        redacted.fallbackProviders.length === 0 ? 'none' : redacted.fallbackProviders.join(', ')
      }`,
      '',
      ...statuses.map(
        (status) =>
          `  ${status.providerId.padEnd(14)} ${status.status.padEnd(20)} ${status.detail}`,
      ),
    ].join('\n')
  }

  return [
    'SymbolWright Providers',
    '',
    `Active provider: ${redacted.activeProvider ?? 'not configured'}`,
    `Active model:    ${redacted.activeModel ?? 'provider default'}`,
    '',
    ...redacted.providers.map(
      (provider) =>
        `  ${provider.id.padEnd(14)} key=${provider.apiKey.padEnd(10)} enabled=${String(
          provider.enabled,
        ).padEnd(5)} model=${provider.defaultModel ?? 'not configured'}`,
    ),
  ].join('\n')
}
