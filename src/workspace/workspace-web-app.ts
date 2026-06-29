import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'

import { ProviderGateway } from '../providers/provider-gateway.js'
import type {
  ProviderStatusReport,
  RedactedProviderGatewayConfig,
} from '../providers/provider-gateway.types.js'
import type { WorkspaceState } from '../cli-workspace.js'

export interface WorkspaceWebBoundary {
  readonly mutatesFiles: false
  readonly executesShell: false
  readonly invokesProvider: false
  readonly externalApiCalls: false
  readonly fakeConnectedState: false
}

export interface WorkspaceWebSnapshot {
  readonly app: {
    readonly name: 'CodeMind Workspace Web Surface'
    readonly mode: 'local-runtime-api'
    readonly liveLocalApi: true
  }
  readonly workspace: WorkspaceState
  readonly providers: {
    readonly redactedConfig: RedactedProviderGatewayConfig
    readonly statuses: readonly ProviderStatusReport[]
  }
  readonly boundary: WorkspaceWebBoundary
}

export interface WorkspaceWebHttpResponse {
  readonly statusCode: number
  readonly contentType: string
  readonly body: string
}

export interface WorkspaceWebServerOptions {
  readonly host: string
  readonly port: number
  readonly snapshotFactory: () => WorkspaceWebSnapshot
}

export interface StartedWorkspaceWebServer {
  readonly server: Server
  readonly url: string
  readonly host: string
  readonly port: number
}

export function buildWorkspaceWebSnapshot(workspace: WorkspaceState): WorkspaceWebSnapshot {
  const gateway = new ProviderGateway()
  return {
    app: {
      name: 'CodeMind Workspace Web Surface',
      mode: 'local-runtime-api',
      liveLocalApi: true,
    },
    workspace,
    providers: {
      redactedConfig: gateway.getRedactedConfig(),
      statuses: gateway.getProviderStatuses(),
    },
    boundary: {
      mutatesFiles: false,
      executesShell: false,
      invokesProvider: false,
      externalApiCalls: false,
      fakeConnectedState: false,
    },
  }
}

function jsonResponse(body: unknown): WorkspaceWebHttpResponse {
  return {
    statusCode: 200,
    contentType: 'application/json; charset=utf-8',
    body: JSON.stringify(body, null, 2),
  }
}

function textResponse(statusCode: number, body: string): WorkspaceWebHttpResponse {
  return {
    statusCode,
    contentType: 'text/plain; charset=utf-8',
    body,
  }
}

export function renderWorkspaceWebHtml(): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>CodeMind Workspace</title>
  <style>
    :root { color-scheme: dark; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
    body { margin: 0; background: #0b1020; color: #e8ecff; }
    main { max-width: 980px; margin: 0 auto; padding: 32px 18px; }
    h1 { margin: 0 0 6px; font-size: 34px; }
    p { color: #aeb8db; line-height: 1.55; }
    .grid { display: grid; gap: 14px; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); }
    .card { border: 1px solid #2a355f; border-radius: 16px; background: #111832; padding: 18px; }
    .label { color: #8ea0d7; font-size: 13px; text-transform: uppercase; letter-spacing: .08em; }
    pre { overflow: auto; padding: 14px; border-radius: 12px; background: #080c18; color: #dce5ff; }
    .ok { color: #8ff0b7; }
    .warn { color: #ffd36b; }
    .fail { color: #ff8f8f; }
  </style>
</head>
<body>
  <main>
    <h1>CodeMind Workspace</h1>
    <p>This is a local runtime API surface. It reports workspace and provider readiness from CodeMind. It does not execute shell commands, mutate files, or claim external providers are connected without real local evidence.</p>
    <section class="grid">
      <article class="card">
        <div class="label">Local API</div>
        <h2 id="api-status">Checking...</h2>
        <p id="workspace-summary">Waiting for /api/health.</p>
      </article>
      <article class="card">
        <div class="label">Provider Gateway</div>
        <h2 id="provider-status">Checking...</h2>
        <p id="provider-summary">Waiting for /api/providers.</p>
      </article>
      <article class="card">
        <div class="label">Boundary</div>
        <p>No file writes, no shell execution, no provider invocation, and no external API calls are performed by this page.</p>
      </article>
    </section>
    <h2>Runtime payload</h2>
    <pre id="payload">Loading...</pre>
  </main>
  <script>
    async function loadJson(path) {
      const response = await fetch(path, { headers: { accept: 'application/json' } });
      if (!response.ok) throw new Error(path + ' returned HTTP ' + response.status);
      return response.json();
    }

    function classForStatus(status) {
      if (status === 'configured') return 'ok';
      if (status === 'missing_credentials' || status === 'disabled') return 'warn';
      return 'fail';
    }

    Promise.all([loadJson('/api/health'), loadJson('/api/providers')])
      .then(([health, providers]) => {
        document.getElementById('api-status').textContent = 'Live local API';
        document.getElementById('api-status').className = 'ok';
        document.getElementById('workspace-summary').textContent = health.workspace.primary.displayName + ' — ' + health.workspace.repoCount + ' repo(s)';

        const configured = providers.statuses.filter((provider) => provider.status === 'configured').length;
        const total = providers.statuses.length;
        document.getElementById('provider-status').textContent = configured + '/' + total + ' configured';
        document.getElementById('provider-status').className = configured > 0 ? 'ok' : 'warn';
        document.getElementById('provider-summary').innerHTML = providers.statuses.map((provider) => '<span class="' + classForStatus(provider.status) + '">' + provider.providerId + ': ' + provider.status + '</span>').join('<br>');
        document.getElementById('payload').textContent = JSON.stringify({ health, providers }, null, 2);
      })
      .catch((error) => {
        document.getElementById('api-status').textContent = 'Local API unavailable';
        document.getElementById('api-status').className = 'fail';
        document.getElementById('workspace-summary').textContent = error.message;
        document.getElementById('payload').textContent = String(error.stack || error.message || error);
      });
  </script>
</body>
</html>`
}

export function renderWorkspaceWebResponse(
  requestPath: string,
  snapshotFactory: () => WorkspaceWebSnapshot,
): WorkspaceWebHttpResponse {
  const url = new URL(requestPath, 'http://localhost')

  if (url.pathname === '/') {
    return {
      statusCode: 200,
      contentType: 'text/html; charset=utf-8',
      body: renderWorkspaceWebHtml(),
    }
  }

  if (url.pathname === '/api/health') {
    const snapshot = snapshotFactory()
    return jsonResponse({
      status: 'ok',
      app: snapshot.app,
      workspace: snapshot.workspace,
      boundary: snapshot.boundary,
    })
  }

  if (url.pathname === '/api/providers') {
    const snapshot = snapshotFactory()
    return jsonResponse(snapshot.providers)
  }

  return textResponse(404, `Not found: ${url.pathname}`)
}

export function createWorkspaceWebRequestHandler(
  snapshotFactory: () => WorkspaceWebSnapshot,
): (request: IncomingMessage, response: ServerResponse) => void {
  return (request, response) => {
    const rendered = renderWorkspaceWebResponse(request.url ?? '/', snapshotFactory)
    response.statusCode = rendered.statusCode
    response.setHeader('content-type', rendered.contentType)
    response.setHeader('cache-control', 'no-store')
    response.end(rendered.body)
  }
}

export async function startWorkspaceWebServer(
  options: WorkspaceWebServerOptions,
): Promise<StartedWorkspaceWebServer> {
  const server = createServer(createWorkspaceWebRequestHandler(options.snapshotFactory))

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(options.port, options.host, () => resolve())
  })

  const address = server.address()
  const port = typeof address === 'object' && address !== null ? address.port : options.port
  return {
    server,
    url: `http://${options.host}:${port}`,
    host: options.host,
    port,
  }
}
