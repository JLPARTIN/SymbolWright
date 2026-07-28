from pathlib import Path
import re


def replace_once(relative: str, before: str, after: str) -> None:
    path = Path(relative)
    text = path.read_text()
    if before not in text:
        raise SystemExit(f"Missing exact anchor in {relative}: {before[:160]!r}")
    path.write_text(text.replace(before, after, 1))


def regex_once(relative: str, pattern: str, replacement: str) -> None:
    path = Path(relative)
    text = path.read_text()
    updated, count = re.subn(pattern, replacement, text, count=1, flags=re.DOTALL)
    if count != 1:
        raise SystemExit(f"Expected one regex match in {relative}, found {count}: {pattern[:160]!r}")
    path.write_text(updated)


replace_once(
    "src/server/deployment-mode.ts",
    "import { parseTrustedProxyCidrs, type ParsedCidr } from './trusted-proxy.js'",
    "import { isIP } from 'node:net'\n\nimport { parseTrustedProxyCidrs, type ParsedCidr } from './trusted-proxy.js'",
)
regex_once(
    "src/server/deployment-mode.ts",
    r"export function isLoopbackHost\(host: string\): boolean \{.*?\n\}",
    """export function isLoopbackHost(host: string): boolean {
  const normalized = host
    .trim()
    .toLowerCase()
    .replace(/^\\[|\\]$/g, '')
  if (normalized === 'localhost' || normalized === '::1') return true
  if (isIP(normalized) !== 4) return false
  return normalized.split('.')[0] === '127'
}""",
)
replace_once(
    "src/server/trusted-proxy.ts",
    """    const family = detected
    const bits = family === 4 ? 32 : 128
    const prefixLength = rawPrefix === undefined ? bits : Number.parseInt(rawPrefix, 10)
    if (!Number.isInteger(prefixLength) || prefixLength < 0 || prefixLength > bits) {
""",
    """    const family = detected
    const bits = family === 4 ? 32 : 128
    if (rawPrefix !== undefined && !/^(0|[1-9]\\d*)$/.test(rawPrefix)) {
      throw new TrustedProxyConfigError(`Malformed trusted-proxy CIDR prefix: ${entry}`)
    }
    const prefixLength = rawPrefix === undefined ? bits : Number(rawPrefix)
    if (!Number.isInteger(prefixLength) || prefixLength < 0 || prefixLength > bits) {
""",
)
regex_once(
    "src/cli-serve.ts",
    r"function parsePositiveInteger\(value: string \| undefined, name: string\): number \| undefined \{.*?\n\}",
    """function parsePositiveInteger(value: string | undefined, name: string): number | undefined {
  if (value === undefined || value.trim().length === 0) return undefined
  const normalized = value.trim()
  if (!/^[1-9]\\d*$/.test(normalized)) {
    throw new Error(`${name} must be a positive integer.`)
  }
  const parsed = Number(normalized)
  if (!Number.isSafeInteger(parsed)) {
    throw new Error(`${name} must be a positive safe integer.`)
  }
  return parsed
}""",
)
regex_once(
    "src/server/metrics-registry.ts",
    r"  public trackResponse\(req: IncomingMessage, res: ServerResponse\): void \{.*?\n  \}\n\n  public snapshot",
    """  public trackResponse(req: IncomingMessage, res: ServerResponse): void {
    if (this.#tracked.has(req)) return
    this.#tracked.add(req)
    this.increment('http_requests_total')
    this.setGauge('http_requests_active', (this.#gauges.get('http_requests_active') ?? 0) + 1)
    let finalized = false
    const finalize = (): void => {
      if (finalized) return
      finalized = true
      this.setGauge(
        'http_requests_active',
        Math.max(0, (this.#gauges.get('http_requests_active') ?? 1) - 1),
      )
      const bucket = Math.floor(res.statusCode / 100)
      if (bucket >= 1 && bucket <= 5) this.increment(`http_responses_${bucket}xx_total`)
      if (res.statusCode === 401) this.increment('http_authentication_failures_total')
      if (res.statusCode === 403) this.increment('http_authorization_denials_total')
      if (res.statusCode === 429) this.increment('http_rate_or_concurrency_limited_total')
      if (res.statusCode >= 500) this.increment('http_server_errors_total')
    }
    res.once('finish', finalize)
    res.once('close', finalize)
  }

  public snapshot""",
)
replace_once(
    "src/app/server/unified-server.ts",
    "import { prepareOperationalServerOptions } from '../../server/operational-bootstrap.js'",
    "import { MetricsRegistry } from '../../server/metrics-registry.js'\nimport { prepareOperationalServerOptions } from '../../server/operational-bootstrap.js'",
)
replace_once(
    "src/app/server/unified-server.ts",
    """  const chatListener = createChatServerRequestListener(options)
  const deploymentSecurity = resolveDeploymentSecurity(options)
""",
    """  const metricsRegistry = options.metricsRegistry ?? new MetricsRegistry()
  const chatListener = createChatServerRequestListener({ ...options, metricsRegistry })
  const deploymentSecurity = resolveDeploymentSecurity(options)
""",
)
replace_once(
    "src/app/server/unified-server.ts",
    """    const url = new URL(req.url ?? '/', 'http://localhost')
    applyOperationalSecurityHeaders(res)
""",
    """    const url = new URL(req.url ?? '/', 'http://localhost')
    metricsRegistry.trackResponse(req, res)
    applyOperationalSecurityHeaders(res)
""",
)

replace_once(
    "src/server/boot-sweep.ts",
    "  const sandboxIndex = path.join(",
    "  let sandboxHistoryHealthy = true\n  const sandboxIndex = path.join(",
)
replace_once(
    "src/server/boot-sweep.ts",
    """    } catch (error) {
      warnings.push(
        `Sandbox history index is unreadable: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }

  let retention = { quarantined: 0, deleted: 0, restored: 0 }
""",
    """    } catch (error) {
      sandboxHistoryHealthy = false
      warnings.push(
        `Sandbox history index is unreadable: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }
  options.readiness.setCheck(
    'sandbox_history',
    sandboxHistoryHealthy,
    sandboxHistoryHealthy ? undefined : 'Sandbox history state is unreadable.',
  )

  let retentionHealthy = true
  let retention = { quarantined: 0, deleted: 0, restored: 0 }
""",
)
replace_once(
    "src/server/boot-sweep.ts",
    """    } catch (error) {
      warnings.push(
        `External-repository retention sweep failed: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }

  options.readiness.setCheck(
""",
    """    } catch (error) {
      retentionHealthy = false
      warnings.push(
        `External-repository retention sweep failed: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }
  options.readiness.setCheck(
    'repository_retention',
    retentionHealthy,
    retentionHealthy ? undefined : 'External repository retention sweep failed.',
  )

  options.readiness.setCheck(
""",
)

replace_once(
    "src/server/metrics-registry.spec.ts",
    """  })
})
""",
    """  })

  it('releases the active gauge once when a client disconnects before finish', () => {
    const registry = new MetricsRegistry()
    const req = {} as IncomingMessage
    const res = Object.assign(new EventEmitter(), { statusCode: 200 }) as unknown as ServerResponse
    registry.trackResponse(req, res)
    res.emit('close')
    res.emit('finish')
    const snapshot = registry.snapshot()
    expect(snapshot.gauges['http_requests_active']).toBe(0)
    expect(snapshot.counters['http_responses_2xx_total']).toBe(1)
  })
})
""",
)
replace_once(
    "src/server/deployment-mode.spec.ts",
    """  it('fails closed for non-loopback plaintext local binding without the escape hatch', () => {
    expect(() => resolveDeploymentSecurity({ host: '0.0.0.0' })).toThrow(DeploymentConfigError)
  })
""",
    """  it('fails closed for non-loopback plaintext local binding without the escape hatch', () => {
    expect(() => resolveDeploymentSecurity({ host: '0.0.0.0' })).toThrow(DeploymentConfigError)
  })

  it('does not mistake a hostname beginning with 127 for a loopback address', () => {
    expect(() => resolveDeploymentSecurity({ host: '127.attacker.example' })).toThrow(
      DeploymentConfigError,
    )
  })
""",
)
replace_once(
    "src/server/trusted-proxy.spec.ts",
    """    expect(() => parseTrustedProxyCidrs(['10.0.0.0/99'])).toThrow(TrustedProxyConfigError)
    expect(() => parseTrustedProxyCidrs(['not-an-ip'])).toThrow(TrustedProxyConfigError)
""",
    """    expect(() => parseTrustedProxyCidrs(['10.0.0.0/99'])).toThrow(TrustedProxyConfigError)
    expect(() => parseTrustedProxyCidrs(['10.0.0.0/24junk'])).toThrow(TrustedProxyConfigError)
    expect(() => parseTrustedProxyCidrs(['not-an-ip'])).toThrow(TrustedProxyConfigError)
""",
)
replace_once(
    "src/cli-serve.spec.ts",
    """  it('reads canonical SYMBOLWRIGHT_* host/port/cors/TLS vars', () => {
""",
    """  it('rejects malformed hosted concurrency limits instead of partially parsing them', () => {
    expect(() =>
      resolveChatServerOptions(
        {},
        {
          SYMBOLWRIGHT_API_KEY: 'k',
          SYMBOLWRIGHT_MAX_PROVIDER_CONCURRENCY: '3junk',
        },
      ),
    ).toThrow('SYMBOLWRIGHT_MAX_PROVIDER_CONCURRENCY must be a positive integer')
  })

  it('reads canonical SYMBOLWRIGHT_* host/port/cors/TLS vars', () => {
""",
)
