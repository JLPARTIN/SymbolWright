/* v8 ignore file -- exercised manually through Codespaces forwarded-port preview. */

import { spawn } from 'node:child_process'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'

import { buildRuntimeStatusView, type ScriptOutput } from './status.js'

const host = process.env['HOST'] || '0.0.0.0'
const port = Number.parseInt(process.env['PORT'] || '3005', 10)
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function runScript(name: string, script: string): Promise<ScriptOutput> {
  const startedAt = Date.now()

  return new Promise((resolve) => {
    const child = spawn(npmCommand, ['run', script, '--silent'], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        CI: '1',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    let output = ''
    let timedOut = false

    const timeout = setTimeout(() => {
      timedOut = true
      child.kill('SIGTERM')
    }, 120_000)

    child.stdout.on('data', (chunk: Buffer) => {
      output += chunk.toString()
    })

    child.stderr.on('data', (chunk: Buffer) => {
      output += chunk.toString()
    })

    child.on('close', (code) => {
      clearTimeout(timeout)

      resolve({
        name,
        exitCode: timedOut ? 124 : (code ?? 1),
        output: output.slice(-30_000),
        durationMs: Date.now() - startedAt,
      })
    })
  })
}

async function collectStatus() {
  const [doctor, releaseReadiness] = await Promise.all([
    runScript('doctor', 'doctor'),
    runScript('release-readiness', 'release-readiness'),
  ])

  return buildRuntimeStatusView(doctor, releaseReadiness)
}

function sendJson(response: ServerResponse, value: unknown): void {
  response.writeHead(200, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  })
  response.end(JSON.stringify(value, null, 2))
}

function sendHtml(response: ServerResponse): void {
  response.writeHead(200, {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-store',
  })

  response.end(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>CodeMind Runtime Preview</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: #080c16;
      --panel: #111a2f;
      --panel-2: #17233d;
      --ink: #e8eefc;
      --muted: #9da9c2;
      --pass: #44d07b;
      --warn: #f5c451;
      --fail: #ff6b6b;
      --unknown: #8ea3c8;
    }

    body {
      margin: 0;
      background: radial-gradient(circle at top left, #152442, var(--bg) 44%);
      color: var(--ink);
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      padding: 24px;
    }

    main {
      max-width: 1100px;
      margin: 0 auto;
    }

    header {
      background: rgba(17, 26, 47, 0.92);
      border: 1px solid #283759;
      border-radius: 18px;
      padding: 24px;
      margin-bottom: 18px;
    }

    h1 {
      margin: 0 0 8px;
      font-size: clamp(28px, 5vw, 44px);
    }

    .muted {
      color: var(--muted);
    }

    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(230px, 1fr));
      gap: 14px;
      margin: 18px 0;
    }

    .card, pre {
      background: rgba(17, 26, 47, 0.92);
      border: 1px solid #283759;
      border-radius: 16px;
      padding: 16px;
    }

    .label {
      color: var(--muted);
      font-size: 13px;
      margin-bottom: 8px;
    }

    .value {
      font-size: 18px;
      font-weight: 700;
      overflow-wrap: anywhere;
    }

    .pass { color: var(--pass); }
    .warn { color: var(--warn); }
    .fail { color: var(--fail); }
    .unknown { color: var(--unknown); }

    button {
      border: 0;
      border-radius: 12px;
      padding: 12px 16px;
      background: #2f6fed;
      color: white;
      font-weight: 700;
      cursor: pointer;
    }

    pre {
      white-space: pre-wrap;
      overflow-wrap: anywhere;
      color: #dbe6ff;
    }
  </style>
</head>
<body>
  <main>
    <header>
      <h1>CodeMind Runtime Preview</h1>
      <p class="muted">Live Codespaces browser preview backed by <code>npm run doctor</code> and <code>npm run release-readiness</code>.</p>
      <button onclick="loadStatus()">Refresh live status</button>
    </header>

    <section id="status" class="muted">Loading CodeMind runtime status...</section>
  </main>

  <script>
    const statusEl = document.getElementById('status');

    function escapeHtml(value) {
      return String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
    }

    async function loadStatus() {
      statusEl.textContent = 'Loading CodeMind runtime status...';

      const response = await fetch('/api/status', { cache: 'no-store' });
      const data = await response.json();

      const cards = data.cards.map((card) => \`
        <article class="card">
          <div class="label">\${escapeHtml(card.label)}</div>
          <div class="value \${escapeHtml(card.state)}">\${escapeHtml(card.value)}</div>
        </article>
      \`).join('');

      const scripts = data.scripts.map((script) => \`
        <h2>\${escapeHtml(script.name)} — exit \${escapeHtml(script.exitCode)} — \${escapeHtml(script.durationMs)}ms</h2>
        <pre>\${escapeHtml(script.output)}</pre>
      \`).join('');

      statusEl.innerHTML = \`
        <header>
          <h2>Overall: <span class="\${escapeHtml(data.overallState)}">\${escapeHtml(data.overallState).toUpperCase()}</span></h2>
          <p class="muted">Generated at \${escapeHtml(data.generatedAt)}</p>
        </header>
        <section class="grid">\${cards}</section>
        <section>\${scripts}</section>
      \`;
    }

    loadStatus().catch((error) => {
      statusEl.innerHTML = '<pre>' + escapeHtml(error.stack || error.message || error) + '</pre>';
    });
  </script>
</body>
</html>`)
}

async function handleRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const url = request.url || '/'

  if (url === '/' || url === '/index.html') {
    sendHtml(response)
    return
  }

  if (url === '/api/status') {
    sendJson(response, await collectStatus())
    return
  }

  response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
  response.end(`Not found: ${escapeHtml(url)}`)
}

createServer((request, response) => {
  handleRequest(request, response).catch((error: unknown) => {
    response.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' })
    response.end(error instanceof Error ? error.stack : String(error))
  })
}).listen(port, host, () => {
  console.log(`CodeMind Runtime Preview listening on http://${host}:${port}`)
})
