export const AELIB_CONNECTOR_ID = 'AELIB-X1YA0I' as const
export const DEFAULT_AELIB_HEALTH_PATH = '/health' as const

export type AelibConnectorState =
  | 'NOT_CONFIGURED'
  | 'MISCONFIGURED'
  | 'UNREACHABLE'
  | 'CONNECTED'

export interface AelibConnectorEnv {
  readonly CODEMIND_AELIB_ENDPOINT?: string
  readonly AELIB_ENDPOINT?: string
  readonly CODEMIND_AELIB_HEALTH_PATH?: string
  readonly AELIB_HEALTH_PATH?: string
  readonly CODEMIND_AELIB_TOKEN?: string
  readonly AELIB_TOKEN?: string
}

export interface AelibConnectorConfig {
  readonly connectorId: typeof AELIB_CONNECTOR_ID
  readonly endpoint?: string
  readonly healthPath: string
  readonly tokenState: 'configured' | 'missing'
}

export interface AelibConnectorStatus {
  readonly connectorId: typeof AELIB_CONNECTOR_ID
  readonly state: AelibConnectorState
  readonly endpoint?: string
  readonly healthUrl?: string
  readonly tokenState: 'configured' | 'missing'
  readonly detail: string
  readonly checkedAt: string
}

export interface AelibHealthTransportResponse {
  readonly status: number
  readonly body?: unknown
}

export interface AelibHealthTransport {
  readonly request: (
    url: string,
    init: { readonly method: 'GET'; readonly headers: Record<string, string> },
  ) => Promise<AelibHealthTransportResponse>
}

export interface CheckAelibConnectionOptions {
  readonly env?: AelibConnectorEnv
  readonly transport?: AelibHealthTransport
  readonly now?: () => Date
}

function firstNonEmpty(...values: readonly (string | undefined)[]): string | undefined {
  return values.find((value) => value !== undefined && value.trim().length > 0)?.trim()
}

function normalizeHealthPath(value: string | undefined): string {
  const raw = firstNonEmpty(value) ?? DEFAULT_AELIB_HEALTH_PATH
  return raw.startsWith('/') ? raw : `/${raw}`
}

function joinUrl(base: string, healthPath: string): string {
  return `${base.replace(/\/+$/, '')}${healthPath}`
}

function toStatus(
  state: AelibConnectorState,
  config: AelibConnectorConfig,
  detail: string,
  checkedAt: Date,
  healthUrl?: string,
): AelibConnectorStatus {
  return {
    connectorId: config.connectorId,
    state,
    ...(config.endpoint === undefined ? {} : { endpoint: config.endpoint }),
    ...(healthUrl === undefined ? {} : { healthUrl }),
    tokenState: config.tokenState,
    detail,
    checkedAt: checkedAt.toISOString(),
  }
}

export function resolveAelibConnectorConfig(
  env: AelibConnectorEnv = process.env,
): AelibConnectorConfig {
  const endpoint = firstNonEmpty(env.CODEMIND_AELIB_ENDPOINT, env.AELIB_ENDPOINT)
  const token = firstNonEmpty(env.CODEMIND_AELIB_TOKEN, env.AELIB_TOKEN)
  const healthPath = normalizeHealthPath(
    firstNonEmpty(env.CODEMIND_AELIB_HEALTH_PATH, env.AELIB_HEALTH_PATH),
  )

  return {
    connectorId: AELIB_CONNECTOR_ID,
    ...(endpoint === undefined ? {} : { endpoint }),
    healthPath,
    tokenState: token === undefined ? 'missing' : 'configured',
  }
}

export function createFetchAelibHealthTransport(): AelibHealthTransport {
  return {
    async request(url, init): Promise<AelibHealthTransportResponse> {
      const response = await fetch(url, { method: init.method, headers: init.headers })
      const contentType = response.headers.get('content-type') ?? ''
      const body = contentType.includes('application/json')
        ? await response.json().catch(() => undefined)
        : await response.text().catch(() => undefined)

      return { status: response.status, body }
    },
  }
}

export async function checkAelibConnection(
  options: CheckAelibConnectionOptions = {},
): Promise<AelibConnectorStatus> {
  const checkedAt = options.now?.() ?? new Date()
  const env = options.env ?? process.env
  const config = resolveAelibConnectorConfig(env)
  const token = firstNonEmpty(env.CODEMIND_AELIB_TOKEN, env.AELIB_TOKEN)

  if (config.endpoint === undefined) {
    return toStatus(
      'NOT_CONFIGURED',
      config,
      'Set CODEMIND_AELIB_ENDPOINT to enable the AELIB-X1YA0I connector health check.',
      checkedAt,
    )
  }

  let healthUrl: string
  try {
    const parsedEndpoint = new URL(config.endpoint)
    healthUrl = joinUrl(parsedEndpoint.toString(), config.healthPath)
  } catch {
    return toStatus(
      'MISCONFIGURED',
      config,
      `Invalid AELIB endpoint URL: ${config.endpoint}`,
      checkedAt,
    )
  }

  const headers: Record<string, string> = {
    accept: 'application/json',
    'x-codemind-connector': AELIB_CONNECTOR_ID,
  }

  if (token !== undefined) {
    headers.authorization = `Bearer ${token}`
  }

  try {
    const transport = options.transport ?? createFetchAelibHealthTransport()
    const response = await transport.request(healthUrl, { method: 'GET', headers })

    if (response.status >= 200 && response.status < 300) {
      return toStatus('CONNECTED', config, `AELIB health check returned HTTP ${response.status}.`, checkedAt, healthUrl)
    }

    return toStatus(
      'UNREACHABLE',
      config,
      `AELIB health check returned HTTP ${response.status}.`,
      checkedAt,
      healthUrl,
    )
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    return toStatus(
      'UNREACHABLE',
      config,
      `AELIB health check failed: ${message}`,
      checkedAt,
      healthUrl,
    )
  }
}
