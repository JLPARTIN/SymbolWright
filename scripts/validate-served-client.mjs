#!/usr/bin/env node
// Fetches SymbolWright's served root HTML, extracts every inline <script> block,
// and syntax-checks the executable ones with the real V8 parser. Catches the
// class of bug where TypeScript compiles cleanly but the emitted browser
// JavaScript is invalid (e.g. an unescaped newline landing inside a
// single-quoted string once a template literal is nested one level too
// deep). Usable standalone (spins up its own ephemeral server) or pointed at
// an already-running instance via --url, so codespaces-start.mjs can reuse
// the same check against the real server it just launched.
import { randomBytes } from 'node:crypto'
import { pathToFileURL } from 'node:url'

async function loadDist() {
  try {
    const [validator, server] = await Promise.all([
      import('../dist/devtools/served-client-validator.js'),
      import('../dist/app/server/unified-server.js'),
    ])
    return { validateServedHtml: validator.validateServedHtml, startUnifiedServer: server.startUnifiedServer }
  } catch (error) {
    if (error && error.code === 'ERR_MODULE_NOT_FOUND') {
      throw new Error('dist/ is missing or stale. Run "npm run build" before validate:served-client.')
    }
    throw error
  }
}

export async function fetchAndValidate(url) {
  const { validateServedHtml } = await loadDist()
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`GET ${url} returned HTTP ${response.status}`)
  }
  const html = await response.text()
  return validateServedHtml(html)
}

async function runAgainstEphemeralServer() {
  const { startUnifiedServer } = await loadDist()
  const server = await startUnifiedServer({
    apiKey: randomBytes(24).toString('hex'),
    host: '127.0.0.1',
    port: 0,
  })
  try {
    return await fetchAndValidate(`${server.url}/`)
  } finally {
    await new Promise((resolve) => server.server.close(() => resolve()))
  }
}

export function formatValidationReport(result) {
  const lines = []

  for (const script of result.scripts) {
    if (script.kind !== 'executable') {
      lines.push(`  [skip] script #${script.index} (${script.kind})`)
      continue
    }

    if (script.syntax?.valid) {
      lines.push(`  [ok]   script #${script.index} (executable, ${script.content.length} chars)`)
      continue
    }

    lines.push(`  [FAIL] script #${script.index} (executable): ${script.syntax?.error ?? 'invalid syntax'}`)
    if (script.syntax?.line !== undefined) {
      lines.push(`         at line ${script.syntax.line}`)
    }
    for (const nearby of script.syntax?.nearbyLines ?? []) {
      lines.push(`         ${nearby}`)
    }
  }

  lines.push('')
  lines.push(
    result.allValid
      ? `${result.executableCount} executable browser script(s) passed, ${result.jsonCount} JSON block(s) skipped.`
      : 'FAILED: served browser JavaScript is invalid.',
  )

  return lines.join('\n')
}

async function main() {
  const urlArgIndex = process.argv.indexOf('--url')
  const url = urlArgIndex === -1 ? undefined : process.argv[urlArgIndex + 1]

  console.log(url === undefined ? 'Validating served SymbolWright browser client (ephemeral server)...' : `Validating served SymbolWright browser client at ${url} ...`)

  const result = url === undefined ? await runAgainstEphemeralServer() : await fetchAndValidate(url)
  console.log(formatValidationReport(result))
  process.exitCode = result.allValid ? 0 : 1
}

const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href

if (invokedDirectly) {
  main().catch((error) => {
    console.error('validate-served-client failed:', error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
}
