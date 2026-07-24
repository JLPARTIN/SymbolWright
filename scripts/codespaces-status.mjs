#!/usr/bin/env node
// Read-only diagnostics for the CodeMind Codespaces server: is it listening,
// is it healthy, which PID, which branch/commit, which providers are
// detected (never their values), where the logs are, the real forwarded
// URL, and whether the currently served browser scripts still parse.
import {
  DEFAULT_HOST,
  LOG_FILE,
  PID_FILE,
  currentGitInfo,
  detectProviders,
  isProcessAlive,
  isTrackedCodemindProcess,
  readPidRecord,
  resolveOpenUrl,
} from './lib/codespaces-common.mjs'

async function main() {
  const record = readPidRecord()
  const host = record?.host ?? DEFAULT_HOST
  const port = record?.port ?? Number.parseInt(process.env.CODEMIND_CHAT_PORT ?? '8787', 10)
  const localUrl = `http://${host === '0.0.0.0' ? '127.0.0.1' : host}:${port}`

  console.log('CodeMind Codespaces status\n')

  console.log('Process:')
  if (record === undefined) {
    console.log('  No tracked PID (never started with codespaces:start, or already stopped)')
  } else {
    const alive = isProcessAlive(record.pid)
    const tracked = alive && isTrackedCodemindProcess(record.pid, record.marker)
    console.log(`  PID: ${record.pid} (${alive ? (tracked ? 'running, verified' : 'running, UNVERIFIED -- marker mismatch') : 'not running (stale PID file)'})`)
    console.log(`  Started: ${record.startedAt}`)
  }
  console.log(`  PID file: ${PID_FILE}\n`)

  console.log('Port:')
  let health
  try {
    const response = await fetch(`${localUrl}/api/health`, { signal: AbortSignal.timeout(2_000) })
    health = { reachable: true, status: response.status, ok: response.ok }
  } catch (error) {
    health = { reachable: false, error: error instanceof Error ? error.message : String(error) }
  }
  console.log(`  ${port}: ${health.reachable ? 'listening' : 'not listening'}\n`)

  console.log('Health endpoint:')
  console.log(`  ${health.reachable ? `HTTP ${health.status} (${health.ok ? 'ok' : 'unhealthy'})` : `unreachable (${health.error})`}\n`)

  const git = currentGitInfo()
  console.log('Repository:')
  console.log(`  Branch: ${git.branch}`)
  console.log(`  Commit: ${git.commit}\n`)

  console.log('Provider (detected only, keys never shown):')
  const providers = detectProviders()
  const detected = providers.filter((provider) => provider.detected)
  if (detected.length === 0) {
    console.log('  None detected — browser-only features available')
  } else {
    for (const provider of detected) {
      console.log(`  ${provider.displayName} (${provider.envVar} set)`)
    }
  }
  console.log('')

  console.log('Logs:')
  console.log(`  ${LOG_FILE}\n`)

  console.log('Open:')
  console.log(`  ${resolveOpenUrl(port)}/#/settings\n`)

  console.log('Served browser script validation:')
  if (!health.reachable || !health.ok) {
    console.log('  Skipped (server is not healthy)')
  } else {
    try {
      const { fetchAndValidate, formatValidationReport } = await import('./validate-served-client.mjs')
      const result = await fetchAndValidate(`${localUrl}/`)
      console.log(
        formatValidationReport(result)
          .split('\n')
          .map((line) => (line.length > 0 ? `  ${line}` : line))
          .join('\n'),
      )
    } catch (error) {
      console.log(`  Failed to validate: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
}

main().catch((error) => {
  console.error('codespaces:status failed:', error instanceof Error ? error.message : error)
  process.exitCode = 1
})
