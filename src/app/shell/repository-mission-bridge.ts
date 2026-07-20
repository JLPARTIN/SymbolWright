export function buildRepositoryMissionBridgeScript(): string {
  return `
    (function () {
      const repositoryFetch = window.fetch.bind(window);

      function missionId() {
        return localStorage.getItem('codemind_active_mission_id');
      }

      function isRepositoryUrl(value) {
        try {
          const url = new URL(value, window.location.origin);
          return url.pathname.startsWith('/api/repository/');
        } catch (_) {
          return false;
        }
      }

      function pathFromUrl(value) {
        try { return new URL(value, window.location.origin).searchParams.get('path'); }
        catch (_) { return null; }
      }

      async function latestMissionCheckpoint(activeMissionId) {
        const key = localStorage.getItem('codemind_api_key') || '';
        const list = await repositoryFetch('/api/checkpoints?session=' + encodeURIComponent(activeMissionId), {
          headers: { authorization: 'Bearer ' + key },
        });
        if (!list.ok) return null;
        const listBody = await list.json();
        const checkpoint = (listBody.checkpoints || [])[0];
        if (!checkpoint) return null;
        const detail = await repositoryFetch('/api/checkpoints/' + encodeURIComponent(checkpoint.checkpointId), {
          headers: { authorization: 'Bearer ' + key },
        });
        if (!detail.ok) return null;
        const detailBody = await detail.json();
        const metadata = detailBody.checkpoint;
        return {
          checkpointId: metadata.checkpointId,
          createdAt: metadata.createdAt,
          paths: (metadata.files || []).map(function (file) { return file.targetPath; }),
        };
      }

      async function recordRepositoryResponse(urlValue, method, requestBody, response) {
        const activeMissionId = missionId();
        if (!activeMissionId || typeof window.codemindRecordMissionEvent !== 'function') return;
        let body;
        try { body = await response.clone().json(); } catch (_) { return; }
        const path = pathFromUrl(urlValue) || (requestBody && requestBody.path);

        if (method === 'GET' && String(urlValue).startsWith('/api/repository/file') && response.status === 200 && path) {
          await window.codemindRecordMissionEvent({ kind: 'file-opened', path: path, contentHash: body.contentHash });
          return;
        }
        if (method === 'PUT' && String(urlValue).startsWith('/api/repository/file')) {
          if (response.status === 409 && path) {
            await window.codemindRecordMissionEvent({ kind: 'file-conflict', path: path });
          } else if (response.status === 200 && path) {
            const checkpoint = await latestMissionCheckpoint(activeMissionId);
            await window.codemindRecordMissionEvent({
              kind: 'file-saved', path: path, contentHash: body.contentHash, checkpoint: checkpoint || undefined,
            });
          }
          return;
        }
        if (method === 'GET' && String(urlValue).startsWith('/api/repository/diff') && response.status === 200 && path) {
          await window.codemindRecordMissionEvent({ kind: 'diff-viewed', path: path });
          return;
        }
        if (method === 'GET' && String(urlValue).startsWith('/api/repository/status') && response.status === 200) {
          const summary = body.summary || {};
          const paths = ['staged', 'unstaged', 'untracked', 'conflicted'].flatMap(function (group) {
            return (summary[group] || []).map(function (entry) { return entry.path; });
          });
          await window.codemindRecordMissionEvent({ kind: 'repository-state', branch: body.currentBranch, modifiedPaths: paths });
          return;
        }
        if (method === 'POST' && String(urlValue).startsWith('/api/repository/branches') && response.status === 200) {
          await window.codemindRecordMissionEvent({ kind: 'branch-changed', branch: body.branch });
          return;
        }
        if (method === 'POST' && String(urlValue).startsWith('/api/repository/commit') && response.status === 200) {
          await window.codemindRecordMissionEvent({ kind: 'commit-created', summary: 'Commit created from Repository view.' });
          return;
        }
        if (method === 'POST' && String(urlValue).startsWith('/api/repository/push') && response.status === 200) {
          await window.codemindRecordMissionEvent({ kind: 'push-completed', branch: body.branch, remote: body.remote });
          return;
        }
        if (method === 'POST' && String(urlValue).startsWith('/api/repository/pull-request') && response.status === 200 && body.pullRequestUrl) {
          await window.codemindRecordMissionEvent({ kind: 'pr-created', pullRequestUrl: body.pullRequestUrl });
          return;
        }
        if (method === 'POST' && /\/api\/repository\/checkpoints\/[^/]+\/restore/.test(String(urlValue)) && response.status === 200) {
          const match = /\/api\/repository\/checkpoints\/([^/]+)\/restore/.exec(String(urlValue));
          if (match && match[1]) await window.codemindRecordMissionEvent({ kind: 'checkpoint-restored', checkpointId: decodeURIComponent(match[1]) });
        }
      }

      window.fetch = function (input, init) {
        const urlValue = typeof input === 'string' ? input : (input && input.url) || '';
        if (!isRepositoryUrl(urlValue)) return repositoryFetch(input, init);
        const method = ((init && init.method) || 'GET').toUpperCase();
        let requestBody = null;
        let effectiveInit = init;
        if (init && typeof init.body === 'string') {
          try {
            requestBody = JSON.parse(init.body);
            const activeMissionId = missionId();
            if (activeMissionId && method === 'PUT' && String(urlValue).startsWith('/api/repository/file')) {
              requestBody.sessionId = activeMissionId;
              effectiveInit = Object.assign({}, init, { body: JSON.stringify(requestBody) });
            }
          } catch (_) {
            requestBody = null;
          }
        }
        return repositoryFetch(input, effectiveInit).then(function (response) {
          void recordRepositoryResponse(urlValue, method, requestBody, response);
          return response;
        });
      };

      window.codemindApplyMissionToRepository = function (mission, reconciliation) {
        const section = document.querySelector('[data-view="repository"]');
        if (!section) return;
        let header = document.getElementById('repository-mission-header');
        if (!header) {
          header = document.createElement('div');
          header.id = 'repository-mission-header';
          header.className = 'mission-context-header';
          section.insertBefore(header, section.firstChild);
        }
        header.innerHTML = '<strong>Mission: ' + appEscapeHtml(mission.name) + '</strong>' +
          '<span>Repository: ' + appEscapeHtml(mission.repository.repositoryName || mission.repository.rootPath) + '</span>' +
          '<span>Branch: ' + appEscapeHtml(mission.repository.branch || '(unavailable)') + '</span>' +
          '<span>Status: ' + appEscapeHtml(mission.status) + '</span>' +
          (reconciliation && reconciliation.hasDrift ? '<span class="warn">Repository drift detected — reconcile in Missions before assuming state matches.</span>' : '');
        if (mission.workspace.activeFilePath && typeof window.codemindOpenRepositoryFile === 'function' && (!reconciliation || reconciliation.repositoryAvailable)) {
          void window.codemindOpenRepositoryFile(mission.workspace.activeFilePath);
        }
      };
    })();
  `
}
