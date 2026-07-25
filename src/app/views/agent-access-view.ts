import { PERMISSION_PROFILES } from '../../access/access-profiles.js'

/**
 * The unified shell's `#/agent-access` view — the operator-facing surface for the delegated
 * agent access system (`src/access/`): create scoped grants for external LLMs/coding agents/MCP
 * clients, approve pending device-authorization requests, and pause/revoke/rotate/inspect
 * existing grants. Every action here calls the real `/api/v1/*` routes — there is no mock data.
 */
export function renderAgentAccessViewHtml(): string {
  const profileOptions = PERMISSION_PROFILES.map(
    (profile) =>
      `<option value="${profile.id}">${profile.displayName}${profile.recommended ? ' (recommended)' : ''}</option>`,
  ).join('')

  return `<section data-view="agent-access" class="app-view" style="display:none">
    <h2>Agent Access</h2>
    <p class="muted">Authorize an external LLM, coding agent, MCP client, or automation to use SymbolWright directly — scoped by repository, branch pattern, capability, and expiration, never a shared API key. See <code>docs/security/DELEGATED_AGENT_ACCESS.md</code> for the full model.</p>
    <div id="agent-access-status" class="muted">Connect with your SymbolWright API key in Settings to manage agent access.</div>

    <div class="card" id="agent-access-new-token" style="display:none">
      <h3>New credential — shown once</h3>
      <p class="muted">Copy this token now. SymbolWright stores only a salted hash of it and cannot show it again — rotate the grant if it is lost.</p>
      <textarea id="agent-access-new-token-value" readonly rows="2" style="width:100%"></textarea>
      <button type="button" class="secondary" onclick="document.getElementById('agent-access-new-token').style.display='none'">Dismiss</button>
    </div>

    <div class="card">
      <h3>Create agent grant</h3>
      <form id="agent-access-create-form" onsubmit="return submitCreateAgentGrant(event)">
        <label for="aa-display-name">Agent name</label>
        <input id="aa-display-name" placeholder="e.g. Claude Code" required />

        <label for="aa-principal-type">Principal type</label>
        <select id="aa-principal-type">
          <option value="coding-agent">Coding agent</option>
          <option value="llm">External LLM</option>
          <option value="mcp-client">MCP client</option>
          <option value="automation">Automation</option>
          <option value="ci">CI workflow</option>
          <option value="service-account">Service account</option>
          <option value="human">Human operator</option>
        </select>

        <label for="aa-profile">Permission profile</label>
        <select id="aa-profile" onchange="onAgentAccessProfileChange()">${profileOptions}</select>
        <div id="aa-profile-description" class="muted"></div>

        <label for="aa-repositories">Repositories (comma-separated <code>owner/repo</code>; blank = every repository this installation can reach)</label>
        <input id="aa-repositories" placeholder="JLPARTIN/SymbolWright" />

        <label for="aa-branch-patterns">Allowed write branch patterns (comma-separated)</label>
        <input id="aa-branch-patterns" placeholder="symbolwright/agent/**, feat/**, fix/**" />

        <label for="aa-expires-hours">Expires in (hours)</label>
        <input id="aa-expires-hours" type="number" min="1" value="24" />

        <label><input id="aa-enable-merge" type="checkbox" /> Allow merging pull requests (still requires operator approval before each merge)</label>

        <div id="aa-step-up-fields" style="display:none">
          <label><input id="aa-step-up-confirmed" type="checkbox" /> I understand this grant includes high-risk capabilities</label>
          <label for="aa-reason">Reason (required for high-risk / Temporary Administrator grants)</label>
          <input id="aa-reason" placeholder="e.g. Incident response IR-42" />
        </div>

        <button type="submit">Create grant</button>
      </form>
    </div>

    <div class="card">
      <h3>Pending device authorization requests</h3>
      <div id="agent-access-pending"></div>
    </div>

    <div class="card">
      <h3>Grants</h3>
      <div id="agent-access-grants"></div>
    </div>

    <div class="card" id="agent-access-detail" style="display:none">
      <h3>Grant detail</h3>
      <div id="agent-access-detail-content"></div>
    </div>
  </section>`
}

export function buildAgentAccessViewClientScript(): string {
  return `
    var AGENT_ACCESS_PROFILES = ${JSON.stringify(
      PERMISSION_PROFILES.map((profile) => ({
        id: profile.id,
        description: profile.description,
        requiresStepUp: profile.requiresStepUp,
      })),
    )};

    function agentAccessAuthHeaders() {
      return { authorization: 'Bearer ' + appState.symbolWrightKey, 'content-type': 'application/json' };
    }

    function onAgentAccessProfileChange() {
      var profileId = document.getElementById('aa-profile').value;
      var profile = AGENT_ACCESS_PROFILES.find(function (p) { return p.id === profileId; });
      document.getElementById('aa-profile-description').textContent = profile ? profile.description : '';
      document.getElementById('aa-step-up-fields').style.display = profile && profile.requiresStepUp ? 'block' : 'none';
    }

    function agentAccessRiskBadge(grant) {
      var highRisk = (grant.githubCapabilities || []).some(function (c) {
        return ['repo.pull_request.merge', 'repo.branch.protection.update', 'repo.settings.update', 'repo.collaborators.manage', 'repo.webhooks.manage', 'repo.secrets.manage', 'repo.variables.manage', 'repo.deployments.manage', 'repo.environments.manage', 'repo.repository.delete', 'repo.organization.manage'].indexOf(c) !== -1;
      });
      return highRisk ? '<span class="mission-status" style="background:#52202a;color:#ffaaaa">high-risk</span>' : '<span class="mission-status active">standard</span>';
    }

    async function submitCreateAgentGrant(event) {
      event.preventDefault();
      if (!appState.symbolWrightKey) { window.alert('Set your SymbolWright API key in Settings first.'); return false; }

      var repositoriesRaw = document.getElementById('aa-repositories').value.trim();
      var repositories = repositoriesRaw ? repositoriesRaw.split(',').map(function (s) { return s.trim(); }).filter(Boolean) : [];
      var branchPatternsRaw = document.getElementById('aa-branch-patterns').value.trim();
      var allowedPatterns = branchPatternsRaw ? branchPatternsRaw.split(',').map(function (s) { return s.trim(); }).filter(Boolean) : undefined;

      var body = {
        principalType: document.getElementById('aa-principal-type').value,
        displayName: document.getElementById('aa-display-name').value.trim(),
        profileId: document.getElementById('aa-profile').value,
        repositoryScope: { mode: repositories.length > 0 ? 'selected' : 'installation', repositories: repositories, organizations: [] },
        expiresInHours: Number(document.getElementById('aa-expires-hours').value) || undefined,
        enableMerge: document.getElementById('aa-enable-merge').checked,
        stepUpConfirmed: document.getElementById('aa-step-up-confirmed').checked,
        reason: document.getElementById('aa-reason').value.trim() || undefined,
      };
      if (allowedPatterns) body.branchScope = { allowedPatterns: allowedPatterns };

      try {
        var response = await fetch('/api/v1/access-grants', { method: 'POST', headers: agentAccessAuthHeaders(), body: JSON.stringify(body) });
        var data = await response.json();
        if (!response.ok) { window.alert('Could not create grant: ' + (data.message || data.error || response.status)); return false; }
        if (data.plaintextToken) {
          document.getElementById('agent-access-new-token').style.display = 'block';
          document.getElementById('agent-access-new-token-value').value = data.plaintextToken;
        }
        document.getElementById('agent-access-create-form').reset();
        onAgentAccessProfileChange();
        loadAgentAccessView();
      } catch (error) {
        window.alert('Could not create grant: ' + (error.message || String(error)));
      }
      return false;
    }

    async function agentAccessGrantAction(grantId, action) {
      if (action === 'revoke' && !window.confirm('Revoke this grant? This immediately invalidates every credential and session and cannot be undone.')) return;
      try {
        var response = await fetch('/api/v1/access-grants/' + encodeURIComponent(grantId) + '/' + action, { method: 'POST', headers: agentAccessAuthHeaders(), body: action === 'revoke' ? JSON.stringify({ reason: 'Revoked from Agent Access settings' }) : undefined });
        var data = await response.json();
        if (!response.ok) { window.alert('Action failed: ' + (data.message || data.error || response.status)); return; }
        if (action === 'rotate' && data.token) {
          document.getElementById('agent-access-new-token').style.display = 'block';
          document.getElementById('agent-access-new-token-value').value = data.token;
        }
        loadAgentAccessView();
      } catch (error) {
        window.alert('Action failed: ' + (error.message || String(error)));
      }
    }

    async function agentAccessInspectGrant(grantId) {
      try {
        var response = await fetch('/api/v1/access-grants/' + encodeURIComponent(grantId), { headers: agentAccessAuthHeaders() });
        var data = await response.json();
        if (!response.ok) { window.alert('Could not load grant: ' + (data.message || response.status)); return; }
        var auditResponse = await fetch('/api/v1/audit/agent-access?grantId=' + encodeURIComponent(grantId) + '&limit=20', { headers: agentAccessAuthHeaders() });
        var auditData = await auditResponse.json();

        var detail = document.getElementById('agent-access-detail');
        detail.style.display = 'block';
        document.getElementById('agent-access-detail-content').innerHTML =
          '<p><strong>' + appEscapeHtml(data.grant.displayName) + '</strong> — ' + appEscapeHtml(data.grant.status) + '</p>' +
          '<p class="muted">SymbolWright capabilities: ' + appEscapeHtml((data.grant.symbolWrightCapabilities || []).join(', ')) + '</p>' +
          '<p class="muted">GitHub capabilities: ' + appEscapeHtml((data.grant.githubCapabilities || []).join(', ')) + '</p>' +
          '<p class="muted">Denied: ' + appEscapeHtml((data.grant.deniedCapabilities || []).join(', ')) + '</p>' +
          '<p class="muted">Repositories: ' + appEscapeHtml((data.grant.repositoryScope.repositories || []).join(', ') || data.grant.repositoryScope.mode) + '</p>' +
          '<p class="muted">Write branches: ' + appEscapeHtml((data.grant.branchScope.allowedPatterns || []).join(', ')) + '</p>' +
          '<p class="muted">Credentials: ' + data.credentials.length + ' (last used: ' + appEscapeHtml((data.grant.credentialMetadata && data.grant.credentialMetadata.lastUsedAt) || 'never') + ')</p>' +
          '<p class="muted">Pending approvals: ' + data.pendingApprovals.length + '</p>' +
          '<h4>Recent audit events</h4>' +
          '<table><thead><tr><th>Time</th><th>Type</th><th>Decision</th><th>Reason</th></tr></thead><tbody>' +
          (auditData.events || []).map(function (event) {
            return '<tr><td>' + appEscapeHtml(event.timestamp) + '</td><td>' + appEscapeHtml(event.type) + '</td><td>' + appEscapeHtml(event.decision || '') + '</td><td>' + appEscapeHtml(event.reasonCode || '') + '</td></tr>';
          }).join('') +
          '</tbody></table>';
      } catch (error) {
        window.alert('Could not load grant: ' + (error.message || String(error)));
      }
    }

    async function agentAccessApproveDeviceRequest(userCode, approve) {
      try {
        var response = await fetch('/api/v1/device-authorization/' + (approve ? 'approve' : 'deny'), { method: 'POST', headers: agentAccessAuthHeaders(), body: JSON.stringify({ userCode: userCode }) });
        var data = await response.json();
        if (!response.ok) { window.alert('Action failed: ' + (data.message || response.status)); return; }
        loadAgentAccessView();
      } catch (error) {
        window.alert('Action failed: ' + (error.message || String(error)));
      }
    }

    async function loadAgentAccessView() {
      var statusEl = document.getElementById('agent-access-status');
      if (!appState.symbolWrightKey) {
        statusEl.textContent = 'Connect with your SymbolWright API key in Settings to manage agent access.';
        return;
      }
      statusEl.textContent = 'Loading...';
      try {
        var pendingResponse = await fetch('/api/v1/device-authorization/pending', { headers: agentAccessAuthHeaders() });
        var pendingData = await pendingResponse.json();
        var pendingEl = document.getElementById('agent-access-pending');
        pendingEl.innerHTML = (pendingData.pending || []).length === 0 ? '<p class="muted">None.</p>' :
          (pendingData.pending || []).map(function (request) {
            return '<div class="card"><strong>' + appEscapeHtml(request.displayName) + '</strong> (' + appEscapeHtml(request.principalType) + ') — code ' + appEscapeHtml(request.userCode) + '<br/>' +
              '<button type="button" onclick="agentAccessApproveDeviceRequest(\\'' + request.userCode + '\\', true)">Approve</button>' +
              '<button type="button" class="secondary" onclick="agentAccessApproveDeviceRequest(\\'' + request.userCode + '\\', false)">Deny</button></div>';
          }).join('');

        var grantsResponse = await fetch('/api/v1/access-grants', { headers: agentAccessAuthHeaders() });
        var grantsData = await grantsResponse.json();
        statusEl.textContent = grantsData.grants.length + ' grant(s).';

        document.getElementById('agent-access-grants').innerHTML = grantsData.grants.length === 0
          ? '<p class="muted">No agent grants yet — create one above.</p>'
          : '<table><thead><tr><th>Agent</th><th>Type</th><th>Profile</th><th>Status</th><th>Expires</th><th>Risk</th><th></th></tr></thead><tbody>' +
            grantsData.grants.map(function (grant) {
              return '<tr><td>' + appEscapeHtml(grant.displayName) + '</td><td>' + appEscapeHtml(grant.principalType) + '</td><td>' + appEscapeHtml(grant.profileId) + '</td>' +
                '<td><span class="mission-status ' + (grant.status === 'active' ? 'active' : grant.status === 'paused' ? 'paused' : 'abandoned') + '">' + appEscapeHtml(grant.status) + '</span></td>' +
                '<td>' + appEscapeHtml(grant.expiresAt) + '</td><td>' + agentAccessRiskBadge(grant) + '</td>' +
                '<td>' +
                '<button type="button" class="secondary" onclick="agentAccessInspectGrant(\\'' + grant.id + '\\')">Inspect</button>' +
                (grant.status === 'active' ? '<button type="button" class="secondary" onclick="agentAccessGrantAction(\\'' + grant.id + '\\', \\'pause\\')">Pause</button>' : '') +
                (grant.status === 'paused' ? '<button type="button" class="secondary" onclick="agentAccessGrantAction(\\'' + grant.id + '\\', \\'resume\\')">Resume</button>' : '') +
                '<button type="button" class="secondary" onclick="agentAccessGrantAction(\\'' + grant.id + '\\', \\'rotate\\')">Rotate</button>' +
                '<button type="button" class="mission-danger" onclick="agentAccessGrantAction(\\'' + grant.id + '\\', \\'revoke\\')">Revoke</button>' +
                '</td></tr>';
            }).join('') +
            '</tbody></table>';
      } catch (error) {
        statusEl.textContent = 'Failed to load agent access: ' + (error.message || String(error));
      }
    }

    registerRouterViewInit('agent-access', function () {
      onAgentAccessProfileChange();
      loadAgentAccessView();
    });
  `
}
