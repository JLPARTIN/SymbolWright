#!/usr/bin/env node
// One-command Codespaces startup: stops any stale tracked SymbolWright server,
// installs deps and builds only when needed, generates a local access key,
// launches the unified server on port 8787, waits for it to be healthy,
// validates the actual served browser JavaScript (not just tsc), and prints
// a single clear summary -- including the real forwarded Codespaces URL and
// the access key to paste into Settings. Designed to work from a phone: no
// Ctrl+C required, and re-running this command is how you restart.
import { spawn, spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { existsSync, openSync, statSync } from 'node:fs'
import { join } from 'node:path'

import {
  DEFAULT_HOST,
  DEFAULT_PORT,
  LOG_FILE,
  PID_FILE,
  REPO_ROOT,
  chmodSecret,
  detectProviders,
  ensureRuntimeDir,
  findPidsListeningOnPort,
  isProcessAlive,
  loadOrCreateApiKey,
  readLogTail,
  removePidFile,
  resolveOpenUrl,
  waitForHealth,
  writePidRecord,
} from './lib/codespaces-common.mjs'
import { stopTrackedServer } from './codespaces-stop.mjs'

function log(message) {
  console.log(message)
}

function fail(message) {
  console.error(`\nFAILED: ${message}`)
  process.exitCode = 1
}

function nodeModulesNeedsInstall() {
  const nodeModules = join(REPO_ROOT, 'node_modules')
  const installedLock = join(nodeModules, '.package-lock.json')
  const lockFile = join(REPO_ROOT, 'package-lock.json')

  if (!existsSync(nodeModules) || !existsSync(installedLock)) {
    return true
  }
  if (!existsSync(lockFile)) {
    return false
  }
  return statSync(lockFile).mtimeMs > statSync(installedLock).mtimeMs
}

function runStep(label, command, args) {
  log(`\n> ${label} (${command} ${args.join(' ')})`)
  const result = spawnSync(command, args, { cwd: REPO_ROOT, stdio: 'inherit' })
  if (result.status !== 0) {
    throw new Error(`${label} failed with exit code ${result.status ?? 'unknown'}`)
  }
}

async function main() {
  ensureRuntimeDir()

  // 1. Stop any stale, previously tracked SymbolWright server (mobile-friendly restart: no Ctrl+C needed).
  await stopTrackedServer({ quiet: false })

  // 2. Refuse to touch a port occupied by something we didn't start.
  const foreignPids = findPidsListeningOnPort(DEFAULT_PORT)
  if (foreignPids.length > 0) {
    throw new Error(
      `Port ${DEFAULT_PORT} is already in use by untracked process(es) [${foreignPids.join(', ')}]. ` +
        `SymbolWright only stops servers it started itself (tracked via ${PID_FILE}) -- it will not kill an ` +
        `unrelated process. Stop it manually, then re-run "npm run codespaces:start".`,
    )
  }

  // 3. Install dependencies only when needed.
  if (nodeModulesNeedsInstall()) {
    runStep('Installing dependencies', 'npm', ['ci'])
  } else {
    log('\nDependencies already installed and up to date; skipping npm ci.')
  }

  // 4. Always build current source.
  runStep('Building SymbolWright', 'npm', ['run', 'build'])

  // 5. Resolve environment: preserve anything the user explicitly set.
  const explicitApiKey = process.env.SYMBOLWRIGHT_API_KEY
  const { apiKey, source } =
    typeof explicitApiKey === 'string' && explicitApiKey.trim().length > 0
      ? { apiKey: explicitApiKey.trim(), source: 'env' }
      : loadOrCreateApiKey()

  const runtimeMode = process.env.SYMBOLWRIGHT_RUNTIME_MODE ?? 'APPROVED_EXECUTION'
  const host = process.env.SYMBOLWRIGHT_CHAT_HOST ?? DEFAULT_HOST
  const port = Number.parseInt(process.env.SYMBOLWRIGHT_CHAT_PORT ?? String(DEFAULT_PORT), 10)
  const marker = randomBytes(16).toString('hex')

  const childEnv = {
    ...process.env,
    SYMBOLWRIGHT_API_KEY: apiKey,
    SYMBOLWRIGHT_RUNTIME_MODE: runtimeMode,
    SYMBOLWRIGHT_CHAT_HOST: host,
    SYMBOLWRIGHT_CHAT_PORT: String(port),
    SYMBOLWRIGHT_CODESPACES_MARKER: marker,
  }

  // 6. Launch the server, detached, logging to a stable file (mobile-friendly: no foreground terminal required).
  ensureRuntimeDir()
  const logFd = openSync(LOG_FILE, 'a')
  chmodSecret(LOG_FILE)
  log(`\n> Starting SymbolWright server on ${host}:${port} (log: ${LOG_FILE})`)
  const child = spawn(process.execPath, [join(REPO_ROOT, 'dist', 'cli.js'), 'serve'], {
    cwd: REPO_ROOT,
    env: childEnv,
    detached: true,
    stdio: ['ignore', logFd, logFd],
  })
  child.unref()

  writePidRecord({ pid: child.pid, marker, startedAt: new Date().toISOString(), host, port })

  // 7. Wait for real health, not just "the process started".
  const localUrl = `http://${host === '0.0.0.0' ? '127.0.0.1' : host}:${port}`
  log(`Waiting for ${localUrl}/api/health to become healthy...`)
  const health = await waitForHealth(localUrl)

  if (!health.healthy) {
    log('\n--- last server log output ---')
    log(readLogTail(80))
    log('--- end log output ---')
    removePidFile()
    if (child.pid !== undefined && isProcessAlive(child.pid)) {
      process.kill(child.pid, 'SIGTERM')
    }
    throw new Error(
      `Server did not become healthy within the timeout. See ${LOG_FILE} above for the failure.`,
    )
  }
  log('Server is healthy.')

  // 8. Validate the actual served browser JavaScript -- not just that tsc compiled.
  log('Validating served browser client scripts...')
  const { fetchAndValidate, formatValidationReport } = await import('./validate-served-client.mjs')
  const validation = await fetchAndValidate(`${localUrl}/`)
  log(formatValidationReport(validation))

  if (!validation.allValid) {
    log('\nStopping the server because served browser JavaScript failed validation.')
    await stopTrackedServer({ quiet: true })
    throw new Error('Served browser JavaScript is invalid. See the script validation output above.')
  }

  // 9. Print the summary.
  const openUrl = `${resolveOpenUrl(port)}/#/settings`
  const providers = detectProviders()
  const detected = providers.filter((provider) => provider.detected)

  log('\nSymbolWright Codespaces startup complete\n')
  log('Server:')
  log('  Healthy\n')
  log('Port:')
  log(`  ${port}\n`)
  log('Runtime mode:')
  log(`  ${runtimeMode}\n`)
  log('Provider:')
  if (detected.length === 0) {
    log('  No external provider detected — browser-only features available')
  } else {
    for (const provider of detected) {
      log(`  ${provider.displayName} detected`)
    }
  }
  log('')
  log('Open:')
  log(`  ${openUrl}\n`)
  log('SymbolWright access key:')
  log(`  ${apiKey}`)
  log(
    source === 'env'
      ? '  (from SYMBOLWRIGHT_API_KEY)'
      : source === 'persisted'
        ? '  (reused from the previous start in this Codespace session)'
        : '  (generated for this Codespace session; reused on restart)',
  )
  log('')
  log('Validation:')
  log('  Build passed')
  log('  Health passed')
  log(`  ${validation.executableCount} executable browser scripts passed`)
  log('  Unified app ready')
  log('')
  log('Keep this port private unless you intentionally want public access -- see README "Codespaces Quick Start".')
  log(`Stop with: npm run codespaces:stop`)
}

main().catch((error) => {
  fail(error instanceof Error ? error.message : String(error))
})
