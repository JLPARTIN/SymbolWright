export function renderAutonomyViewHtml(): string {
  return `<section data-view="autonomy" class="app-view" style="display:none">
    <h2>AI Mission Control</h2>
    <p class="muted">Run the active mission through repository planning, semantic editing, validation, repair, impact analysis, and evidence-backed release preparation.</p>
    <div id="autonomy-connection-warning" class="card mission-warning" style="display:none">Connect with your CodeMind access key and select an active mission first.</div>
    <div class="card">
      <div id="autonomy-mission-heading"><strong>No active mission selected.</strong></div>
      <div id="autonomy-actions" class="mission-actions"></div>
      <div id="autonomy-operation-status" class="muted"></div>
    </div>
    <div id="autonomy-dashboard" class="card"><p class="muted">Open a mission from the Missions view to begin.</p></div>
    <div id="autonomy-release" class="card" style="display:none"></div>
  </section>`
}

export function buildAutonomyViewClientScript(): string {
  return `
    const autonomyUiState = { timer: null, loading: false, lastMissionId: null };

    function autonomyHeaders() {
      return { authorization: 'Bearer ' + appState.codemindKey };
    }

    async function autonomyFetchJson(url, options) {
      const response = await fetch(url, Object.assign({}, options || {}, {
        headers: Object.assign({}, autonomyHeaders(), (options && options.headers) || {}),
      }));
      const body = await response.json().catch(function () { return {}; });
      return { status: response.status, body: body };
    }

    function autonomyMissionId() {
      return appState.activeMissionId || localStorage.getItem('codemind_active_mission_id');
    }

    function autonomySetWarning(message) {
      const warning = document.getElementById('autonomy-connection-warning');
      warning.style.display = message ? 'block' : 'none';
      warning.textContent = message || '';
    }

    function autonomyActionButton(action, label, secondary) {
      return '<button type="button"' + (secondary ? ' class="secondary"' : '') + ' data-autonomy-command="' + appEscapeHtml(action) + '">' + appEscapeHtml(label) + '</button>';
    }

    function autonomyRenderActions(status, hasExecution) {
      const actions = [];
      if (!hasExecution) actions.push(autonomyActionButton('start', 'Start Autonomous Mission', false));
      if (status === 'running') {
        actions.push(autonomyActionButton('pause', 'Pause', true));
        actions.push(autonomyActionButton('cancel', 'Cancel', true));
      }
      if (status === 'interrupted') {
        actions.push(autonomyActionButton('resume', 'Resume', false));
        actions.push(autonomyActionButton('cancel', 'Cancel', true));
      }
      if (status === 'blocked' || status === 'failed') {
        actions.push(autonomyActionButton('retry', 'Retry', false));
        actions.push(autonomyActionButton('cancel', 'Cancel', true));
      }
      actions.push(autonomyActionButton('release', 'Run Complete Release', false));
      actions.push(autonomyActionButton('refresh', 'Refresh', true));
      const target = document.getElementById('autonomy-actions');
      target.innerHTML = actions.join('');
      target.querySelectorAll('[data-autonomy-command]').forEach(function (button) {
        button.addEventListener('click', function () {
          void autonomyCommand(button.getAttribute('data-autonomy-command'));
        });
      });
    }

    function autonomyTaskRows(tasks) {
      if (!Array.isArray(tasks) || tasks.length === 0) return '<p class="muted">No task graph is available yet.</p>';
      return '<ul class="autonomy-task-list">' + tasks.map(function (task) {
        return '<li><strong>' + appEscapeHtml(task.objective || task.id || 'Task') + '</strong><span>' + appEscapeHtml(task.state || 'unknown') + ' · attempt ' + Number(task.attempts || 0) + '</span></li>';
      }).join('') + '</ul>';
    }

    function autonomyRenderDashboard(dashboard) {
      const target = document.getElementById('autonomy-dashboard');
      if (!dashboard) {
        target.innerHTML = '<h3>Autonomous execution</h3><p class="muted">No autonomous execution record exists yet.</p>';
        autonomyRenderActions(undefined, false);
        return;
      }
      const counts = dashboard.taskCounts || {};
      const readiness = dashboard.mergeReadiness;
      const impact = dashboard.impact;
      const readinessHtml = readiness
        ? '<div><strong>Merge readiness</strong><br>' + appEscapeHtml(readiness.decision) + ' · ' + Number(readiness.score || 0) + '/100</div>'
        : '<div><strong>Merge readiness</strong><br>Unavailable</div>';
      const impactHtml = impact
        ? '<div><strong>Repository impact</strong><br>' + appEscapeHtml(impact.risk) + ' · ' + Number(impact.riskScore || 0) + '/100</div>'
        : '<div><strong>Repository impact</strong><br>Unavailable</div>';
      target.innerHTML =
        '<h3>Autonomous execution</h3>' +
        '<div class="mission-summary-grid">' +
          '<div><strong>Status</strong><br>' + appEscapeHtml(dashboard.status || 'unknown') + '</div>' +
          '<div><strong>Completed tasks</strong><br>' + Number(counts.completed || 0) + '</div>' +
          '<div><strong>Running tasks</strong><br>' + Number(counts.running || 0) + '</div>' +
          '<div><strong>Blocked tasks</strong><br>' + Number(counts.blocked || 0) + '</div>' +
          '<div><strong>Repair attempts</strong><br>' + Number(dashboard.repairAttemptCount || 0) + '</div>' +
          readinessHtml + impactHtml +
        '</div>' +
        '<h4>Task graph</h4>' + autonomyTaskRows(dashboard.tasks) +
        '<h4>Modified files</h4>' +
        (Array.isArray(dashboard.modifiedFiles) && dashboard.modifiedFiles.length
          ? '<ul>' + dashboard.modifiedFiles.map(function (file) { return '<li><code>' + appEscapeHtml(file) + '</code></li>'; }).join('') + '</ul>'
          : '<p class="muted">No modified files recorded.</p>');
      autonomyRenderActions(dashboard.status, true);
      autonomySchedulePolling(dashboard.status === 'running');
    }

    function autonomyRenderRelease(release) {
      const target = document.getElementById('autonomy-release');
      if (!release) { target.style.display = 'none'; target.innerHTML = ''; return; }
      target.style.display = 'block';
      const acceptance = release.acceptance || {};
      const pullRequest = acceptance.pullRequest || {};
      target.innerHTML =
        '<h3>Autonomous release</h3>' +
        '<div class="mission-summary-grid">' +
          '<div><strong>Release state</strong><br>' + appEscapeHtml(release.state || 'unknown') + '</div>' +
          '<div><strong>Next action</strong><br>' + appEscapeHtml(release.nextAction || 'unknown') + '</div>' +
          '<div><strong>Execution mode</strong><br>' + appEscapeHtml(release.executionMode || 'unknown') + '</div>' +
          '<div><strong>Validation</strong><br>' + (acceptance.validation && acceptance.validation.passed ? 'passed' : 'not passed') + '</div>' +
          '<div><strong>Evidence</strong><br>' + (Array.isArray(acceptance.evidence) ? acceptance.evidence.length : 0) + '</div>' +
        '</div>' +
        '<h4>Prepared pull request</h4>' +
        '<p><strong>' + appEscapeHtml(pullRequest.title || 'No PR title generated') + '</strong></p>' +
        '<pre class="mission-export-output" style="display:block">' + appEscapeHtml(pullRequest.body || '') + '</pre>';
    }

    async function autonomyLoad() {
      const missionId = autonomyMissionId();
      const heading = document.getElementById('autonomy-mission-heading');
      if (!appState.codemindKey || !missionId) {
        autonomySetWarning('Connect with your CodeMind access key and select an active mission first.');
        heading.innerHTML = '<strong>No active mission selected.</strong>';
        autonomyRenderDashboard(null);
        autonomyRenderRelease(null);
        autonomySchedulePolling(false);
        return;
      }
      autonomySetWarning('');
      autonomyUiState.lastMissionId = missionId;
      const mission = appState.activeMission;
      heading.innerHTML = '<strong>' + appEscapeHtml(mission ? mission.name : missionId) + '</strong><div class="muted">' + appEscapeHtml(mission ? mission.objective : missionId) + '</div>';
      const result = await autonomyFetchJson('/api/missions/' + encodeURIComponent(missionId) + '/autonomy');
      if (result.status === 404) {
        autonomyRenderDashboard(null);
        autonomyRenderRelease(null);
        return;
      }
      if (result.status !== 200) {
        document.getElementById('autonomy-operation-status').textContent = result.body.error || ('HTTP ' + result.status);
        return;
      }
      autonomyRenderDashboard(result.body.dashboard);
      autonomyRenderRelease(result.body.release);
    }

    async function autonomyCommand(action) {
      if (action === 'refresh') { await autonomyLoad(); return; }
      const missionId = autonomyMissionId();
      if (!missionId || autonomyUiState.loading) return;
      autonomyUiState.loading = true;
      const status = document.getElementById('autonomy-operation-status');
      status.textContent = action === 'release' ? 'Running the complete autonomous release...' : 'Running autonomy action: ' + action + '...';
      try {
        const result = await autonomyFetchJson('/api/missions/' + encodeURIComponent(missionId) + '/autonomy/' + encodeURIComponent(action), { method: 'POST' });
        if (result.status < 200 || result.status >= 300) throw new Error(result.body.error || ('HTTP ' + result.status));
        status.textContent = action === 'release' ? 'Release evidence generated.' : 'Autonomy action completed.';
        if (result.body.release) autonomyRenderRelease(result.body.release);
        await autonomyLoad();
        if (typeof missionLoadTimeline === 'function') await missionLoadTimeline();
      } catch (error) {
        status.textContent = error && error.message ? error.message : String(error);
      } finally {
        autonomyUiState.loading = false;
      }
    }

    function autonomySchedulePolling(enabled) {
      if (autonomyUiState.timer !== null) {
        window.clearInterval(autonomyUiState.timer);
        autonomyUiState.timer = null;
      }
      if (!enabled) return;
      autonomyUiState.timer = window.setInterval(function () { void autonomyLoad(); }, 1500);
    }

    appState.subscribe(function (state) {
      if (state.activeMissionId !== autonomyUiState.lastMissionId) void autonomyLoad();
    });

    registerRouterViewInit('autonomy', function () { void autonomyLoad(); });
  `
}
