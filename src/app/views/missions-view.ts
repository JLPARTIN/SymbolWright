const MISSION_FILTERS = [
  ['all', 'All'],
  ['agent', 'Agent'],
  ['files', 'Files'],
  ['tools', 'Tools'],
  ['validation', 'Validation'],
  ['git', 'Git'],
  ['checkpoints', 'Checkpoints'],
  ['memory', 'Memory'],
  ['web-mcp', 'Web/MCP'],
  ['subagents-skills', 'Subagents/Skills'],
] as const

export function renderMissionsViewHtml(): string {
  const filters = MISSION_FILTERS.map(
    ([value, label]) => `<option value="${value}">${label}</option>`,
  ).join('')

  return `<section data-view="missions" class="app-view" style="display:none">
    <h2>Missions</h2>
    <p class="muted">Durable local coding objectives. Missions persist conversation, repository context, evidence, checkpoint and memory references, and Git/PR progress under <code>.codemind/missions/</code>.</p>
    <div id="mission-connection-warning" class="mission-warning" style="display:none">Connect with your CodeMind access key before opening missions.</div>

    <div class="mission-layout">
      <div class="card mission-sidebar">
        <h3>New Mission</h3>
        <label for="mission-name">Name</label>
        <input id="mission-name" maxlength="200" placeholder="Fix provider activation" />
        <label for="mission-objective">Objective</label>
        <textarea id="mission-objective" maxlength="32000" placeholder="Describe the coding objective and definition of done."></textarea>
        <label for="mission-workspace-kind">Workspace</label>
        <select id="mission-workspace-kind">
          <option value="repository">Repository</option>
          <option value="scratch">Scratch</option>
        </select>
        <label for="mission-repository-path">Repository path</label>
        <input id="mission-repository-path" value="." placeholder="." />
        <label for="mission-runtime-mode">Initial runtime mode</label>
        <select id="mission-runtime-mode">
          <option value="READ_ONLY">READ_ONLY</option>
          <option value="PROPOSAL_ONLY">PROPOSAL_ONLY</option>
          <option value="APPROVED_EXECUTION">APPROVED_EXECUTION</option>
          <option value="PLAN_ONLY">PLAN_ONLY</option>
        </select>
        <button type="button" id="mission-create-btn">Create Mission</button>
        <div id="mission-create-status" class="muted"></div>

        <h3>Recent Missions</h3>
        <button type="button" class="secondary" id="mission-refresh-btn">Refresh</button>
        <div id="mission-list" class="mission-list"></div>
      </div>

      <div class="mission-detail-column">
        <div id="active-mission-header" class="card mission-active-header">
          <strong>No active mission</strong>
          <span class="muted">Create or resume a mission to link Agent and Repository work.</span>
        </div>

        <div id="mission-reconciliation" class="card mission-warning" style="display:none"></div>

        <div id="mission-detail" class="card">
          <h3>Mission Summary</h3>
          <p class="muted">Select a mission to inspect its durable state.</p>
        </div>

        <div class="card">
          <div class="mission-timeline-heading">
            <h3>Timeline</h3>
            <label for="mission-event-filter">Filter</label>
            <select id="mission-event-filter">${filters}</select>
          </div>
          <div id="mission-timeline" class="mission-timeline"><p class="muted">No mission selected.</p></div>
        </div>

        <div class="card">
          <h3>Import Mission Bundle</h3>
          <p class="muted">Imported missions receive a new local ID and begin PAUSED. Repository files, credentials, and checkpoint contents are never imported by default.</p>
          <textarea id="mission-import-json" class="mission-import" placeholder="Paste codemind.mission.bundle JSON"></textarea>
          <button type="button" class="secondary" id="mission-import-btn">Import Paused Copy</button>
          <div id="mission-import-status" class="muted"></div>
        </div>
      </div>
    </div>
  </section>`
}

export function buildMissionsViewClientScript(): string {
  return `
    const missionUiState = { selectedId: null, selected: null, reconciliation: null, loaded: false };

    function missionAuthHeaders(extra) {
      return Object.assign({ authorization: 'Bearer ' + appState.codemindKey }, extra || {});
    }

    async function missionFetchJson(url, options) {
      const response = await fetch(url, Object.assign({}, options || {}, {
        headers: missionAuthHeaders((options && options.headers) || {}),
      }));
      const body = await response.json().catch(function () { return {}; });
      return { status: response.status, body: body };
    }

    function missionFormatTime(value) {
      if (!value) return 'unknown';
      const date = new Date(value);
      return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
    }

    function missionSetActive(mission, reconciliation) {
      missionUiState.selectedId = mission ? mission.id : null;
      missionUiState.selected = mission || null;
      missionUiState.reconciliation = reconciliation || null;
      appState.set({
        activeMissionId: mission ? mission.id : null,
        activeMission: mission || null,
        activeMissionReadOnly: false,
      });
      if (mission) localStorage.setItem('codemind_active_mission_id', mission.id);
      else localStorage.removeItem('codemind_active_mission_id');
      missionRenderActiveHeader();
      if (typeof window.codemindApplyMissionToAgent === 'function' && mission) {
        window.codemindApplyMissionToAgent(mission);
      }
      if (typeof window.codemindApplyMissionToRepository === 'function' && mission) {
        window.codemindApplyMissionToRepository(mission, reconciliation || null);
      }
    }

    function missionRenderActiveHeader() {
      const header = document.getElementById('active-mission-header');
      const mission = appState.activeMission;
      if (!mission) {
        header.innerHTML = '<strong>No active mission</strong><span class="muted">Create or resume a mission to link Agent and Repository work.</span>';
        return;
      }
      header.innerHTML =
        '<div><strong>Mission: ' + appEscapeHtml(mission.name) + '</strong></div>' +
        '<div>Repository: ' + appEscapeHtml(mission.repository.repositoryName || mission.repository.rootPath) + '</div>' +
        '<div>Branch: ' + appEscapeHtml(mission.repository.branch || '(detached or unavailable)') + '</div>' +
        '<div>Status: <span class="mission-status ' + appEscapeHtml(mission.status.toLowerCase()) + '">' + appEscapeHtml(mission.status) + '</span></div>' +
        '<div class="muted">Last saved: ' + appEscapeHtml(missionFormatTime(mission.updatedAt)) + ' · Revision ' + mission.revision + '</div>';
    }

    function missionRenderList(data) {
      const target = document.getElementById('mission-list');
      if (!data.missions || data.missions.length === 0) {
        target.innerHTML = '<p class="muted">No missions yet.</p>';
        return;
      }
      target.innerHTML = data.missions.map(function (mission) {
        const repo = mission.repositoryName || mission.repositoryRoot;
        const validation = mission.validationState ? (' · Validation: ' + mission.validationState) : '';
        const pr = mission.pullRequestUrl ? '<div><a href="' + appEscapeHtml(mission.pullRequestUrl) + '" target="_blank" rel="noopener">Pull request</a></div>' : '';
        return '<article class="mission-list-item" data-mission-id="' + appEscapeHtml(mission.id) + '">' +
          '<button type="button" class="mission-open-btn secondary" data-mission-id="' + appEscapeHtml(mission.id) + '">' + appEscapeHtml(mission.name) + '</button>' +
          '<div class="muted">' + appEscapeHtml(mission.objective.slice(0, 140)) + '</div>' +
          '<div>' + appEscapeHtml(repo) + ' · ' + appEscapeHtml(mission.branch || '(no branch)') + '</div>' +
          '<div><span class="mission-status ' + appEscapeHtml(mission.status.toLowerCase()) + '">' + appEscapeHtml(mission.status) + '</span>' + validation + ' · ' + mission.changedFileCount + ' changed</div>' +
          '<div class="muted">Updated ' + appEscapeHtml(missionFormatTime(mission.updatedAt)) + '</div>' + pr +
          '</article>';
      }).join('');
      target.querySelectorAll('.mission-open-btn').forEach(function (button) {
        button.addEventListener('click', function () { void missionOpen(button.getAttribute('data-mission-id')); });
      });
    }

    async function missionLoadList() {
      if (!appState.codemindKey) {
        document.getElementById('mission-connection-warning').style.display = 'block';
        return;
      }
      document.getElementById('mission-connection-warning').style.display = 'none';
      const result = await missionFetchJson('/api/missions?limit=100');
      if (result.status !== 200) {
        document.getElementById('mission-list').textContent = result.body.error || ('HTTP ' + result.status);
        return;
      }
      missionRenderList(result.body);
    }

    async function missionCreate() {
      const status = document.getElementById('mission-create-status');
      const name = document.getElementById('mission-name').value.trim();
      const objective = document.getElementById('mission-objective').value.trim();
      if (!name || !objective) { status.textContent = 'Name and objective are required.'; return; }
      status.textContent = 'Creating...';
      const result = await missionFetchJson('/api/missions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: name,
          objective: objective,
          workspaceKind: document.getElementById('mission-workspace-kind').value,
          repositoryPath: document.getElementById('mission-repository-path').value.trim() || '.',
          runtimeMode: document.getElementById('mission-runtime-mode').value,
          activeProviderId: appState.providerId || undefined,
        }),
      });
      if (result.status !== 201) { status.textContent = result.body.error || ('HTTP ' + result.status); return; }
      status.textContent = 'Mission created and saved locally.';
      missionSetActive(result.body.mission, result.body.reconciliation);
      missionUiState.selectedId = result.body.mission.id;
      missionRenderDetail(result.body.mission);
      missionRenderReconciliation(result.body.reconciliation);
      await missionLoadTimeline();
      await missionLoadList();
    }

    function missionRenderDetail(mission) {
      const target = document.getElementById('mission-detail');
      const refs = mission.references;
      const evidence = mission.evidence;
      const buttons = [];
      if (mission.status === 'ACTIVE') buttons.push('<button type="button" data-action="pause">Pause</button>');
      if (mission.status === 'PAUSED') buttons.push('<button type="button" data-action="resume">Resume</button>');
      if (mission.status === 'COMPLETED') buttons.push('<button type="button" data-action="reopen">Explicitly reopen</button>');
      if (mission.status !== 'COMPLETED' && mission.status !== 'ABANDONED') {
        buttons.push('<button type="button" data-action="complete">Complete</button>');
        buttons.push('<button type="button" class="secondary" data-action="abandon">Abandon</button>');
      }
      buttons.push('<button type="button" class="secondary" data-action="rename">Rename</button>');
      buttons.push('<button type="button" class="secondary" data-action="export">Export</button>');
      buttons.push('<button type="button" class="mission-danger" data-action="delete">Delete</button>');
      if (mission.workspace.kind === 'scratch' && !mission.workspace.scratchAttached) {
        buttons.push('<button type="button" class="secondary" data-action="attach-scratch">Attach Scratch Workspace</button>');
      }
      target.innerHTML =
        '<h3>' + appEscapeHtml(mission.name) + '</h3>' +
        '<p>' + appEscapeHtml(mission.objective) + '</p>' +
        '<div class="mission-summary-grid">' +
          '<div><strong>Status</strong><br>' + appEscapeHtml(mission.status) + '</div>' +
          '<div><strong>Runtime mode</strong><br>' + appEscapeHtml(mission.agent.runtimeMode) + '</div>' +
          '<div><strong>Provider</strong><br>' + appEscapeHtml(mission.agent.activeProviderId || '(none selected)') + '</div>' +
          '<div><strong>Open files</strong><br>' + mission.workspace.openFiles.length + '</div>' +
          '<div><strong>Tool calls</strong><br>' + evidence.toolCalls.length + '</div>' +
          '<div><strong>Validation runs</strong><br>' + evidence.validationRuns.length + '</div>' +
          '<div><strong>Checkpoints</strong><br>' + refs.checkpointIds.length + '</div>' +
          '<div><strong>Memory references</strong><br>' + refs.memoryEntryIds.length + '</div>' +
          '<div><strong>Commits</strong><br>' + refs.commitShas.length + '</div>' +
          '<div><strong>Pull requests</strong><br>' + refs.pullRequestUrls.length + '</div>' +
        '</div>' +
        '<div class="mission-actions">' + buttons.join('') + '</div>' +
        '<pre id="mission-export-output" class="mission-export-output" style="display:none"></pre>';
      target.querySelectorAll('[data-action]').forEach(function (button) {
        button.addEventListener('click', function () { void missionAction(button.getAttribute('data-action')); });
      });
    }

    function missionRenderReconciliation(reconciliation) {
      const target = document.getElementById('mission-reconciliation');
      if (!reconciliation || !reconciliation.hasDrift) { target.style.display = 'none'; target.innerHTML = ''; return; }
      const mission = missionUiState.selected;
      const warnings = (reconciliation.warnings || []).map(function (warning) { return '<li>' + appEscapeHtml(warning) + '</li>'; }).join('');
      target.style.display = 'block';
      target.innerHTML = '<strong>This repository changed since the mission was last active.</strong><ul>' + warnings + '</ul>' +
        '<button type="button" id="mission-continue-current">Continue with current repository state</button>' +
        (reconciliation.repositoryAvailable && reconciliation.recordedBranch && reconciliation.branchExists !== false
          ? '<button type="button" class="secondary" id="mission-switch-recorded">Switch to recorded branch if safe</button>'
          : '') +
        '<button type="button" class="secondary" id="mission-open-readonly">Open mission read-only</button>' +
        '<button type="button" class="secondary" id="mission-reconcile-cancel">Cancel</button>';
      document.getElementById('mission-continue-current').addEventListener('click', function () { void missionContinueCurrent(); });
      document.getElementById('mission-switch-recorded')?.addEventListener('click', function () { void missionSwitchRecorded(); });
      document.getElementById('mission-open-readonly').addEventListener('click', function () {
        appState.set({ activeMissionReadOnly: true });
        target.innerHTML = '<strong>Mission opened read-only.</strong> Repository state was not changed.';
      });
      document.getElementById('mission-reconcile-cancel').addEventListener('click', function () { target.style.display = 'none'; });
      if (!reconciliation.repositoryAvailable) {
        target.insertAdjacentHTML('afterbegin', '<p><strong>Repository path is unavailable. Agent history and evidence are still accessible.</strong></p>');
      }
      if (!mission) target.style.display = 'none';
    }

    async function missionContinueCurrent() {
      const reconciliation = missionUiState.reconciliation;
      const mission = missionUiState.selected;
      if (!mission || !reconciliation) return;
      const result = await missionFetchJson('/api/missions/' + encodeURIComponent(mission.id), {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          revision: mission.revision,
          repository: {
            branch: reconciliation.currentBranch || null,
            headSha: reconciliation.currentHeadSha || null,
          },
        }),
      });
      if (result.status === 409) { await missionOpen(mission.id); return; }
      if (result.status !== 200) { window.alert(result.body.error || ('HTTP ' + result.status)); return; }
      missionUiState.selected = result.body.mission;
      missionSetActive(result.body.mission, null);
      missionRenderDetail(result.body.mission);
      missionRenderReconciliation(null);
    }

    async function missionSwitchRecorded() {
      const mission = missionUiState.selected;
      if (!mission) return;
      if (!window.confirm('Switch the clean repository to the mission recorded branch? No branch will be created.')) return;
      const result = await missionFetchJson('/api/missions/' + encodeURIComponent(mission.id) + '/switch-recorded-branch', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ revision: mission.revision }),
      });
      if (result.status !== 200) { window.alert(result.body.error || ('HTTP ' + result.status)); return; }
      missionUiState.selected = result.body.mission;
      missionSetActive(result.body.mission, result.body.reconciliation);
      missionRenderDetail(result.body.mission);
      missionRenderReconciliation(result.body.reconciliation);
    }

    async function missionOpen(id) {
      const result = await missionFetchJson('/api/missions/' + encodeURIComponent(id));
      if (result.status !== 200) { window.alert(result.body.error || ('HTTP ' + result.status)); return; }
      missionUiState.selectedId = id;
      missionUiState.selected = result.body.mission;
      missionUiState.reconciliation = result.body.reconciliation;
      missionRenderDetail(result.body.mission);
      missionRenderReconciliation(result.body.reconciliation);
      await missionLoadTimeline();
      if (result.body.mission.status === 'ACTIVE') missionSetActive(result.body.mission, result.body.reconciliation);
    }

    async function missionPostState(action) {
      const mission = missionUiState.selected;
      if (!mission) return;
      const result = await missionFetchJson('/api/missions/' + encodeURIComponent(mission.id) + '/' + action, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ revision: mission.revision }),
      });
      if (result.status === 409) { await missionOpen(mission.id); return; }
      if (result.status !== 200) { window.alert(result.body.error || ('HTTP ' + result.status)); return; }
      missionUiState.selected = result.body.mission;
      missionRenderDetail(result.body.mission);
      missionRenderReconciliation(result.body.reconciliation || null);
      if (result.body.mission.status === 'ACTIVE') missionSetActive(result.body.mission, result.body.reconciliation || null);
      else if (appState.activeMissionId === mission.id) missionSetActive(null, null);
      await missionLoadTimeline();
      await missionLoadList();
    }

    async function missionAction(action) {
      const mission = missionUiState.selected;
      if (!mission) return;
      if (['pause', 'resume', 'complete', 'abandon', 'reopen'].includes(action)) {
        if ((action === 'complete' || action === 'abandon') && !window.confirm(action + ' this mission?')) return;
        await missionPostState(action);
        return;
      }
      if (action === 'rename') {
        const name = window.prompt('Mission name:', mission.name);
        if (!name || name === mission.name) return;
        const result = await missionFetchJson('/api/missions/' + encodeURIComponent(mission.id), {
          method: 'PATCH', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ revision: mission.revision, name: name }),
        });
        if (result.status !== 200) { window.alert(result.body.error || ('HTTP ' + result.status)); return; }
        missionUiState.selected = result.body.mission;
        missionRenderDetail(result.body.mission);
        if (appState.activeMissionId === mission.id) missionSetActive(result.body.mission, null);
        await missionLoadList();
        return;
      }
      if (action === 'export') {
        const result = await missionFetchJson('/api/missions/' + encodeURIComponent(mission.id) + '/export', { method: 'POST' });
        if (result.status !== 200) { window.alert(result.body.error || ('HTTP ' + result.status)); return; }
        const output = document.getElementById('mission-export-output');
        output.style.display = 'block';
        output.textContent = JSON.stringify(result.body, null, 2);
        return;
      }
      if (action === 'attach-scratch') {
        if (!window.confirm('Attach the current browser Scratch Workspace structure to this mission? This is an explicit one-time link; no provider keys are included.')) return;
        const scratchState = typeof window.codemindGetScratchMissionState === 'function' ? window.codemindGetScratchMissionState() : {};
        const result = await missionFetchJson('/api/missions/' + encodeURIComponent(mission.id) + '/attach-scratch', {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ revision: mission.revision, scratchState: scratchState }),
        });
        if (result.status !== 200) { window.alert(result.body.error || ('HTTP ' + result.status)); return; }
        missionUiState.selected = result.body.mission;
        missionRenderDetail(result.body.mission);
        return;
      }
      if (action === 'delete') {
        if (!window.confirm('Delete only this mission record and mission-owned exports? Repository files, commits, checkpoints, and memory databases will remain.')) return;
        const result = await missionFetchJson('/api/missions/' + encodeURIComponent(mission.id), {
          method: 'DELETE', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ revision: mission.revision, confirm: true }),
        });
        if (result.status !== 200) { window.alert(result.body.error || ('HTTP ' + result.status)); return; }
        if (appState.activeMissionId === mission.id) missionSetActive(null, null);
        missionUiState.selected = null;
        missionUiState.selectedId = null;
        document.getElementById('mission-detail').innerHTML = '<h3>Mission Summary</h3><p class="muted">Mission deleted. Repository state was not changed.</p>';
        document.getElementById('mission-timeline').innerHTML = '<p class="muted">No mission selected.</p>';
        await missionLoadList();
      }
    }

    async function missionLoadTimeline() {
      const id = missionUiState.selectedId;
      if (!id) return;
      const filter = document.getElementById('mission-event-filter').value;
      const result = await missionFetchJson('/api/missions/' + encodeURIComponent(id) + '/events?limit=500&filter=' + encodeURIComponent(filter));
      if (result.status !== 200) return;
      const target = document.getElementById('mission-timeline');
      target.innerHTML = result.body.events.length === 0 ? '<p class="muted">No matching events.</p>' : result.body.events.map(function (event) {
        return '<article class="mission-event"><div><strong>' + appEscapeHtml(event.type) + '</strong></div>' +
          '<div>' + appEscapeHtml(event.summary) + '</div>' +
          '<div class="muted">' + appEscapeHtml(missionFormatTime(event.timestamp)) + '</div></article>';
      }).join('');
    }

    async function missionImport() {
      const target = document.getElementById('mission-import-status');
      const raw = document.getElementById('mission-import-json').value.trim();
      if (!raw) { target.textContent = 'Paste a mission bundle first.'; return; }
      let bundle;
      try { bundle = JSON.parse(raw); } catch (_) { target.textContent = 'Bundle must be valid JSON.'; return; }
      const result = await missionFetchJson('/api/missions/import', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ bundle: bundle }),
      });
      if (result.status !== 201) { target.textContent = result.body.error || ('HTTP ' + result.status); return; }
      target.textContent = 'Imported paused mission: ' + result.body.mission.name;
      document.getElementById('mission-import-json').value = '';
      await missionLoadList();
      await missionOpen(result.body.mission.id);
    }

    window.codemindRecordMissionEvent = async function (record) {
      if (!appState.activeMissionId || appState.activeMissionReadOnly) return null;
      const result = await missionFetchJson('/api/missions/' + encodeURIComponent(appState.activeMissionId) + '/record', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(record),
      });
      if (result.status === 200 && result.body.mission) {
        appState.set({ activeMission: result.body.mission });
        if (missionUiState.selectedId === result.body.mission.id) {
          missionUiState.selected = result.body.mission;
          missionRenderActiveHeader();
        }
      }
      return result;
    };

    window.codemindReloadActiveMission = async function () {
      const id = appState.activeMissionId || localStorage.getItem('codemind_active_mission_id');
      if (!id || !appState.codemindKey) return null;
      const result = await missionFetchJson('/api/missions/' + encodeURIComponent(id));
      if (result.status !== 200 || result.body.mission.status !== 'ACTIVE') {
        if (result.status === 404) localStorage.removeItem('codemind_active_mission_id');
        return null;
      }
      missionSetActive(result.body.mission, result.body.reconciliation);
      return result.body.mission;
    };

    document.getElementById('mission-create-btn').addEventListener('click', function () { void missionCreate(); });
    document.getElementById('mission-refresh-btn').addEventListener('click', function () { void missionLoadList(); });
    document.getElementById('mission-event-filter').addEventListener('change', function () { void missionLoadTimeline(); });
    document.getElementById('mission-import-btn').addEventListener('click', function () { void missionImport(); });

    registerRouterViewInit('missions', function () {
      missionRenderActiveHeader();
      void missionLoadList();
      if (!missionUiState.loaded) {
        missionUiState.loaded = true;
        const activeId = appState.activeMissionId || localStorage.getItem('codemind_active_mission_id');
        if (activeId) void missionOpen(activeId);
      }
    });
  `
}
