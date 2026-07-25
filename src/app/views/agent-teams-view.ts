import { BUILTIN_AGENT_ROLES } from '../../orchestration/orchestration-types.js'

/**
 * The unified shell's `#/agent-teams` view — Mission Control for collaborative multi-agent
 * missions (`src/orchestration/`, Large PR Bundle #11). Every action here calls the real
 * `/api/v1/agent-teams/*` routes, backed by the same live `OrchestrationRuntime` the REST/MCP
 * surfaces share — there is no placeholder or simulated team/task/candidate data.
 */
export function renderAgentTeamsViewHtml(): string {
  const roleOptions = BUILTIN_AGENT_ROLES.map(
    (role) => `<option value="${role}">${role}</option>`,
  ).join('')

  return `<section data-view="agent-teams" class="app-view" style="display:none">
    <h2>Agent Teams</h2>
    <p class="muted">Form a governed multi-agent engineering team for one mission: each member is its own delegated-access principal (see Agent Access), works in an isolated git worktree, and only reaches the canonical repository through peer review and the integration engine.</p>
    <div id="agent-teams-status" class="muted">Connect with your SymbolWright API key in Settings to manage agent teams.</div>

    <div class="agent-teams-layout">
      <div class="card agent-teams-sidebar">
        <h3>New Team</h3>
        <label for="at-mission-id">Mission id</label>
        <input id="at-mission-id" placeholder="mission_..." />
        <label for="at-name">Name</label>
        <input id="at-name" placeholder="Fix mission-recovery reliability" />
        <label for="at-objective">Objective</label>
        <textarea id="at-objective" maxlength="8000" placeholder="Describe the mission objective for this team."></textarea>
        <label for="at-repository-root">Repository root</label>
        <input id="at-repository-root" value="." placeholder="." />
        <button type="button" id="at-create-btn" onclick="return submitCreateAgentTeam(event)">Create Team</button>
        <div id="at-create-status" class="muted"></div>

        <h3>Teams</h3>
        <button type="button" class="secondary" id="at-refresh-btn" onclick="loadAgentTeamsList()">Refresh</button>
        <div id="at-team-list" class="mission-list"></div>
      </div>

      <div class="agent-teams-detail-column">
        <div id="at-detail" class="card">
          <h3>Team</h3>
          <p class="muted">Select a team to inspect its members, tasks, candidates, and audit trail.</p>
        </div>

        <div class="card" id="at-add-member-card" style="display:none">
          <h3>Add Member</h3>
          <label for="at-member-name">Display name</label>
          <input id="at-member-name" placeholder="Repository Investigator" />
          <label for="at-member-role">Role</label>
          <select id="at-member-role">${roleOptions}</select>
          <label for="at-member-provider">Provider</label>
          <select id="at-member-provider">
            <option value="symbolwright-native">SymbolWright native</option>
            <option value="anthropic">Anthropic</option>
            <option value="openai">OpenAI</option>
            <option value="google">Google</option>
            <option value="local-model">Local model</option>
            <option value="mcp-client">MCP client</option>
            <option value="remote-agent">Remote agent</option>
            <option value="human-participant">Human participant</option>
          </select>
          <label for="at-member-trust">Trust tier</label>
          <select id="at-member-trust">
            <option value="untrusted">untrusted</option>
            <option value="restricted">restricted</option>
            <option value="standard" selected>standard</option>
            <option value="trusted">trusted</option>
            <option value="operator-controlled">operator-controlled</option>
          </select>
          <label for="at-member-profile">Delegated-access profile</label>
          <select id="at-member-profile">
            <option value="repository-analyst">Repository Analyst (read-only)</option>
            <option value="coding-agent">Coding Agent</option>
            <option value="maintainer-agent">Maintainer Agent</option>
          </select>
          <button type="button" onclick="return submitAddAgentTeamMember(event)">Add Member</button>
          <div id="at-add-member-status" class="muted"></div>
        </div>

        <div class="card" id="at-members-card" style="display:none">
          <h3>Members</h3>
          <div id="at-members"></div>
        </div>

        <div class="card" id="at-tasks-card" style="display:none">
          <h3>Tasks</h3>
          <div id="at-tasks"></div>
        </div>

        <div class="card" id="at-candidates-card" style="display:none">
          <h3>Change Candidates</h3>
          <div id="at-candidates"></div>
        </div>

        <div class="card" id="at-events-card" style="display:none">
          <h3>Audit Timeline</h3>
          <div id="at-events"></div>
        </div>
      </div>
    </div>
  </section>`
}

export function buildAgentTeamsViewClientScript(): string {
  return `
    var agentTeamsUiState = { selectedId: null };

    function agentTeamsAuthHeaders() {
      return { authorization: 'Bearer ' + appState.symbolWrightKey, 'content-type': 'application/json' };
    }

    async function agentTeamsFetchJson(url, options) {
      var response = await fetch(url, Object.assign({}, options || {}, { headers: agentTeamsAuthHeaders() }));
      var body = await response.json().catch(function () { return {}; });
      return { status: response.status, ok: response.ok, body: body };
    }

    function agentTeamsStatusBadge(status) {
      return '<span class="mission-status ' + appEscapeHtml(status) + '">' + appEscapeHtml(status) + '</span>';
    }

    async function submitCreateAgentTeam(event) {
      event.preventDefault();
      if (!appState.symbolWrightKey) { window.alert('Set your SymbolWright API key in Settings first.'); return false; }
      var body = {
        missionId: document.getElementById('at-mission-id').value.trim(),
        name: document.getElementById('at-name').value.trim(),
        objective: document.getElementById('at-objective').value.trim(),
        repositoryRoot: document.getElementById('at-repository-root').value.trim() || '.',
      };
      var result = await agentTeamsFetchJson('/api/v1/agent-teams', { method: 'POST', body: JSON.stringify(body) });
      var statusEl = document.getElementById('at-create-status');
      if (!result.ok) { statusEl.textContent = 'Could not create team: ' + (result.body.message || result.body.error || result.status); return false; }
      statusEl.textContent = 'Team created.';
      loadAgentTeamsList();
      openAgentTeam(result.body.team.id);
      return false;
    }

    async function loadAgentTeamsList() {
      if (!appState.symbolWrightKey) { document.getElementById('agent-teams-status').style.display = 'block'; return; }
      document.getElementById('agent-teams-status').style.display = 'none';
      var result = await agentTeamsFetchJson('/api/v1/agent-teams');
      var target = document.getElementById('at-team-list');
      if (!result.ok || !result.body.teams || result.body.teams.length === 0) {
        target.innerHTML = '<p class="muted">No teams yet.</p>';
        return;
      }
      target.innerHTML = result.body.teams.map(function (team) {
        return '<article class="mission-list-item"><button type="button" class="secondary" onclick="openAgentTeam(\\'' + team.id + '\\')">' + appEscapeHtml(team.name) + '</button>' +
          '<div>' + agentTeamsStatusBadge(team.status) + '</div>' +
          '<div class="muted">' + appEscapeHtml(team.objective.slice(0, 140)) + '</div></article>';
      }).join('');
    }

    async function agentTeamLifecycleAction(action) {
      var teamId = agentTeamsUiState.selectedId;
      if (!teamId) return;
      var result = await agentTeamsFetchJson('/api/v1/agent-teams/' + encodeURIComponent(teamId) + '/' + action, { method: 'POST' });
      if (!result.ok) { window.alert('Action failed: ' + (result.body.message || result.body.error || result.status)); return; }
      openAgentTeam(teamId);
    }

    async function submitAddAgentTeamMember(event) {
      event.preventDefault();
      var teamId = agentTeamsUiState.selectedId;
      if (!teamId) return false;
      var body = {
        displayName: document.getElementById('at-member-name').value.trim(),
        role: document.getElementById('at-member-role').value,
        provider: document.getElementById('at-member-provider').value,
        trustTier: document.getElementById('at-member-trust').value,
        accessProfileId: document.getElementById('at-member-profile').value,
        principalType: 'coding-agent',
      };
      var result = await agentTeamsFetchJson('/api/v1/agent-teams/' + encodeURIComponent(teamId) + '/members', { method: 'POST', body: JSON.stringify(body) });
      var statusEl = document.getElementById('at-add-member-status');
      if (!result.ok) { statusEl.textContent = 'Could not add member: ' + (result.body.message || result.body.error || result.status); return false; }
      statusEl.textContent = 'Member added.';
      document.getElementById('at-member-name').value = '';
      openAgentTeam(teamId);
      return false;
    }

    async function agentTeamRemoveMember(teamId, memberId) {
      if (!window.confirm('Remove this member? This immediately revokes its delegated-access grant.')) return;
      var result = await agentTeamsFetchJson('/api/v1/agent-teams/' + encodeURIComponent(teamId) + '/members/' + encodeURIComponent(memberId), { method: 'DELETE' });
      if (!result.ok) { window.alert('Could not remove member: ' + (result.body.message || result.body.error || result.status)); return; }
      openAgentTeam(teamId);
    }

    async function agentTeamAssignTask(teamId, taskId) {
      var result = await agentTeamsFetchJson('/api/v1/agent-teams/' + encodeURIComponent(teamId) + '/tasks/' + encodeURIComponent(taskId) + '/assign', { method: 'POST' });
      if (!result.ok) { window.alert('Assignment failed: ' + (result.body.message || result.body.error || result.status)); return; }
      openAgentTeam(teamId);
    }

    function agentTeamsRenderMembers(teamId, members) {
      var card = document.getElementById('at-members-card');
      if (!members || members.length === 0) { card.style.display = 'none'; return; }
      card.style.display = 'block';
      document.getElementById('at-members').innerHTML = members.map(function (member) {
        return '<div class="mission-list-item"><strong>' + appEscapeHtml(member.role) + '</strong> — ' + appEscapeHtml(member.provider) + ' · ' + appEscapeHtml(member.trustTier) +
          ' ' + agentTeamsStatusBadge(member.status) +
          (member.status !== 'removed' ? ' <button type="button" class="secondary" onclick="agentTeamRemoveMember(\\'' + teamId + '\\',\\'' + member.id + '\\')">Remove</button>' : '') +
          '</div>';
      }).join('');
    }

    function agentTeamsRenderTasks(teamId, tasks) {
      var card = document.getElementById('at-tasks-card');
      if (!tasks || tasks.length === 0) { card.style.display = 'none'; return; }
      card.style.display = 'block';
      document.getElementById('at-tasks').innerHTML = tasks.map(function (task) {
        return '<div class="mission-list-item"><strong>' + appEscapeHtml(task.title) + '</strong> ' + agentTeamsStatusBadge(task.status) +
          '<div class="muted">' + appEscapeHtml(task.taskType) + ' · ' + appEscapeHtml(task.executionMode) + ' · ' + appEscapeHtml(task.assignmentPolicy) + '</div>' +
          (task.status === 'ready' ? '<button type="button" class="secondary" onclick="agentTeamAssignTask(\\'' + teamId + '\\',\\'' + task.id + '\\')">Assign</button>' : '') +
          '</div>';
      }).join('');
    }

    function agentTeamsRenderCandidates(candidates) {
      var card = document.getElementById('at-candidates-card');
      if (!candidates || candidates.length === 0) { card.style.display = 'none'; return; }
      card.style.display = 'block';
      document.getElementById('at-candidates').innerHTML = candidates.map(function (candidate) {
        var files = (candidate.changedFiles || []).map(function (f) { return f.path; }).join(', ');
        return '<div class="mission-list-item">' + agentTeamsStatusBadge(candidate.status) + ' — ' + appEscapeHtml(candidate.rationale) +
          '<div class="muted">Files: ' + appEscapeHtml(files) + '</div></div>';
      }).join('');
    }

    async function agentTeamsRenderEvents(teamId) {
      var card = document.getElementById('at-events-card');
      var result = await agentTeamsFetchJson('/api/v1/agent-teams/' + encodeURIComponent(teamId) + '/events');
      if (!result.ok || !result.body.events || result.body.events.length === 0) { card.style.display = 'none'; return; }
      card.style.display = 'block';
      document.getElementById('at-events').innerHTML = result.body.events.map(function (event) {
        return '<div class="mission-list-item muted">' + appEscapeHtml(event.type) + ' · ' + appEscapeHtml(event.timestamp) + '</div>';
      }).join('');
    }

    async function openAgentTeam(teamId) {
      agentTeamsUiState.selectedId = teamId;
      var result = await agentTeamsFetchJson('/api/v1/agent-teams/' + encodeURIComponent(teamId));
      if (!result.ok) { window.alert('Could not load team: ' + (result.body.message || result.status)); return; }
      var team = result.body.team;
      var detail = document.getElementById('at-detail');
      detail.innerHTML = '<h3>' + appEscapeHtml(team.name) + '</h3>' +
        '<div>' + agentTeamsStatusBadge(team.status) + '</div>' +
        '<p class="muted">' + appEscapeHtml(team.objective) + '</p>' +
        '<div class="muted">Members ' + team.metrics.tasksTotal + ' tasks · budget max team size ' + team.budget.maxTeamSize + ' · max concurrent agents ' + team.budget.maxConcurrentAgents + '</div>' +
        '<button type="button" onclick="agentTeamLifecycleAction(\\'start\\')">Start</button> ' +
        '<button type="button" class="secondary" onclick="agentTeamLifecycleAction(\\'pause\\')">Pause</button> ' +
        '<button type="button" class="secondary" onclick="agentTeamLifecycleAction(\\'resume\\')">Resume</button> ' +
        '<button type="button" class="secondary" onclick="agentTeamLifecycleAction(\\'cancel\\')">Cancel</button>';
      document.getElementById('at-add-member-card').style.display = 'block';
      agentTeamsRenderMembers(teamId, result.body.members);
      agentTeamsRenderTasks(teamId, result.body.tasks);
      agentTeamsRenderCandidates(result.body.candidates);
      void agentTeamsRenderEvents(teamId);
    }

    window.loadAgentTeamsList = loadAgentTeamsList;
    window.openAgentTeam = openAgentTeam;
  `
}
