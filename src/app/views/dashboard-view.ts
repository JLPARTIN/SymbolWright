/**
 * The unified shell's default (`#/dashboard`) view. Reuses the real,
 * deterministic `/api/status` diagnostics content that used to be the
 * dashboard server's standalone landing page (`src/web/server.ts`), minus
 * the cross-port "open SymbolWright Chat" link — the Agent view is now just
 * another tab in this same app, not a separate server to link out to.
 */
export function renderDashboardViewHtml(): string {
  return `<section data-view="dashboard" class="app-view">
    <h1>SymbolWright</h1>
    <p class="muted">Real, local, deterministic diagnostics (<code>npm run doctor</code> + <code>npm run release-readiness</code>). No AI provider is required for anything on this page.</p>
    <button type="button" onclick="loadDashboardStatus()">Refresh live status</button>
    <button type="button" class="secondary" onclick="navigateTo('workspace')">Open Workspace →</button>
    <button type="button" class="secondary" onclick="navigateTo('agent')">Open Agent →</button>

    <section id="dashboard-status" class="muted">Loading SymbolWright runtime status...</section>

    <h2>Sandbox network</h2>
    <section id="dashboard-sandbox-network" class="muted">Loading sandbox network status...</section>
  </section>`
}

export function buildDashboardClientScript(): string {
  return `
    async function loadDashboardStatus() {
      const statusEl = document.getElementById('dashboard-status');
      statusEl.textContent = 'Loading SymbolWright runtime status...';

      try {
        const response = await fetch('/api/status', {
          cache: 'no-store',
          headers: appState.symbolWrightKey ? { authorization: 'Bearer ' + appState.symbolWrightKey } : {},
        });
        if (!response.ok) throw new Error('HTTP ' + response.status);
        const data = await response.json();

        const cards = data.cards.map((card) =>
          '<article class="card">' +
          '<div class="label">' + appEscapeHtml(card.label) + '</div>' +
          '<div class="value ' + appEscapeHtml(card.state) + '">' + appEscapeHtml(card.value) + '</div>' +
          '</article>'
        ).join('');

        statusEl.innerHTML =
          '<h2>Overall: <span class="' + appEscapeHtml(data.overallState) + '">' + appEscapeHtml(data.overallState).toUpperCase() + '</span></h2>' +
          '<p class="muted">Generated at ' + appEscapeHtml(data.generatedAt) + '</p>' +
          '<div class="grid">' + cards + '</div>';
      } catch (error) {
        statusEl.innerHTML = '<p class="muted">Connect with your SymbolWright API key in Settings to load detailed status, or ' +
          appEscapeHtml(error.message || String(error)) + '</p>';
      }
      loadSandboxNetworkStatus();
    }

    async function loadSandboxNetworkStatus() {
      const el = document.getElementById('dashboard-sandbox-network');
      el.textContent = 'Loading sandbox network status...';

      try {
        const response = await fetch('/api/sandbox/network-status', {
          cache: 'no-store',
          headers: appState.symbolWrightKey ? { authorization: 'Bearer ' + appState.symbolWrightKey } : {},
        });
        if (response.status === 404) {
          el.innerHTML = '<p class="muted">Sandbox network control plane is only visible to the operator.</p>';
          return;
        }
        if (!response.ok) throw new Error('HTTP ' + response.status);
        const data = await response.json();

        const modeCard =
          '<article class="card">' +
          '<div class="label">Mode</div>' +
          '<div class="value ' + (data.mode === 'configured' ? 'pass' : 'warn') + '">' + appEscapeHtml(data.mode) + '</div>' +
          '</article>';
        const dependencyCard =
          '<article class="card">' +
          '<div class="label">Dependency profiles</div>' +
          '<div class="value">' + data.dependency.profileCount +
          (data.dependency.defaultPolicy ? ' (default: ' + appEscapeHtml(data.dependency.defaultPolicy.id) + '@' + data.dependency.defaultPolicy.version + ')' : '') +
          '</div></article>';
        const egressCard =
          '<article class="card">' +
          '<div class="label">Egress profiles</div>' +
          '<div class="value">' + data.egress.profileCount +
          (data.egress.defaultPolicy ? ' (default: ' + appEscapeHtml(data.egress.defaultPolicy.id) + '@' + data.egress.defaultPolicy.version + ')' : '') +
          '</div></article>';
        const metricsCard =
          '<article class="card">' +
          '<div class="label">Egress requests (allowed / denied)</div>' +
          '<div class="value">' + data.egress.metrics.allowedRequests + ' / ' + data.egress.metrics.deniedRequests +
          '</div></article>';
        const bindingsCard =
          '<article class="card">' +
          '<div class="label">Dependency layer bindings</div>' +
          '<div class="value ' + (data.dependencyLayerBindings.missing + data.dependencyLayerBindings.invalid > 0 ? 'warn' : 'pass') + '">' +
          data.dependencyLayerBindings.valid + ' valid / ' + data.dependencyLayerBindings.missing + ' missing / ' + data.dependencyLayerBindings.invalid + ' invalid' +
          '</div></article>';
        const auditLogCard =
          '<article class="card">' +
          '<div class="label">Egress audit log</div>' +
          '<div class="value">' + (data.egressAuditLog.exists ? Math.round(data.egressAuditLog.sizeBytes / 1024) + ' KiB' : 'not yet created') +
          '</div></article>';
        const concurrencyCard =
          '<article class="card">' +
          '<div class="label">Aggregate concurrency (egress / dependency)</div>' +
          '<div class="value">' +
          data.aggregateConcurrency.egress.active + '/' + data.aggregateConcurrency.egress.limit + ' · ' +
          data.aggregateConcurrency.dependency.active + '/' + data.aggregateConcurrency.dependency.limit +
          '</div></article>';

        const profileRows = (label, profiles) => profiles.length === 0
          ? ''
          : '<h3>' + label + '</h3><ul>' + profiles.map((p) =>
              '<li>' + appEscapeHtml(p.id) + '@' + p.version + (p.enabled ? '' : ' (disabled)') + '</li>'
            ).join('') + '</ul>';

        el.innerHTML =
          '<div class="grid">' + modeCard + dependencyCard + egressCard + metricsCard + bindingsCard + auditLogCard + concurrencyCard + '</div>' +
          profileRows('Dependency profiles', data.dependency.profiles) +
          profileRows('Egress profiles', data.egress.profiles);
      } catch (error) {
        el.innerHTML = '<p class="muted">' + appEscapeHtml(error.message || String(error)) + '</p>';
      }
    }

    registerRouterViewInit('dashboard', loadDashboardStatus);
  `
}
