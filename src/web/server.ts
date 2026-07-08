/* v8 ignore file -- exercised manually through Codespaces forwarded-port preview. */

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'

import { collectStatus } from './status-runner.js'

const host = process.env['HOST'] || '0.0.0.0'
const port = Number.parseInt(process.env['PORT'] || '3005', 10)
const chatPort = Number.parseInt(process.env['CODEMIND_CHAT_PORT'] || '8787', 10)

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function resolveChatUrl(): string {
  const codespaceName = process.env['CODESPACE_NAME']
  const forwardingDomain = process.env['GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN']

  if (codespaceName !== undefined && forwardingDomain !== undefined) {
    return `https://${codespaceName}-${chatPort}.${forwardingDomain}`
  }

  return `http://localhost:${chatPort}`
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

    a.button {
      display: inline-block;
      text-decoration: none;
    }

    button.secondary, a.button.secondary {
      background: #232c50;
      color: #dbe6ff;
    }

    pre {
      white-space: pre-wrap;
      overflow-wrap: anywhere;
      color: #dbe6ff;
    }

    ol {
      color: var(--muted);
      line-height: 1.7;
    }

    code {
      color: #dbe6ff;
    }
  </style>
</head>
<body>
  <main>
    <header>
      <h1>CodeMind &mdash; Get Started</h1>
      <p class="muted">This dashboard is <strong>browser-only mode</strong>: it shows real, local, deterministic diagnostics (<code>npm run doctor</code> + <code>npm run release-readiness</code>). No provider API key is required for anything on this page.</p>
      <p class="muted">Current mode: <strong>Browser-only</strong> &mdash; no AI provider is connected here.</p>
      <button onclick="loadStatus()">Refresh live status</button>
    </header>

    <section>
      <h2>Want AI chat / agent mode too?</h2>
      <p class="muted">That is a separate opt-in server so no provider secrets are required just to preview this dashboard. Start it once:</p>
      <pre>export CODEMIND_API_KEY=$(openssl rand -hex 16)
npm run serve</pre>
      <p class="muted">Then open the chat UI, pick <strong>Browser-only mode</strong> to continue with no provider key, or <strong>API-backed mode</strong> to add a provider key:</p>
      <a class="button" href="${escapeHtml(resolveChatUrl())}" target="_blank" rel="noopener">Open CodeMind Chat &rarr;</a>
      <p class="muted" style="font-size:12px;margin-top:10px;">If that link fails to load, the chat server (port ${String(chatPort)}) is not running yet &mdash; run the command above in a second terminal, then use the Codespaces "Ports" tab to make port ${String(chatPort)} visible.</p>
    </section>

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
