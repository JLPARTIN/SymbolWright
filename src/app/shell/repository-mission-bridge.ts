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

      function rememberEditorFile(path, contentHash) {
        const editor = document.getElementById('repo-editor');
        if (!editor || !path) return;
        editor.dataset.missionPath = path;
        editor.dataset.missionBaseHash = contentHash || '';
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
        let body;
        try { body = await response.clone().json(); } catch (_) { return; }
        const path = pathFromUrl(urlValue) || (requestBody && requestBody.path);

        if (method === 'GET' && String(urlValue).startsWith('/api/repository/file') && response.status === 200 && path) {
          rememberEditorFile(path, body.contentHash);
          if (activeMissionId && typeof window.codemindRecordMissionEvent === 'function') {
            await window.codemindRecordMissionEvent({ kind: 'file-opened', path: path, contentHash: body.contentHash });
          }
          return;
        }
        if (!activeMissionId || typeof window.codemindRecordMissionEvent !== 'function') return;
        if (method === 'PUT' && String(urlValue).startsWith('/api/repository/file')) {
          if (response.status === 409 && path) {
            await window.codemindRecordMissionEvent({ kind: 'file-conflict', path: path });
          } else if (response.status === 200 && path) {
            rememberEditorFile(path, body.contentHash);
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

      async function restoreMissionFile(path) {
        const key = localStorage.getItem('codemind_api_key') || '';
        const response = await window.fetch('/api/repository/file?path=' + encodeURIComponent(path), {
          headers: { authorization: 'Bearer ' + key },
        });
        if (!response.ok) {
          const pathEl = document.getElementById('repo-file-path');
          if (pathEl) pathEl.textContent = 'Mission file is missing or unavailable: ' + path;
          return;
        }
        const body = await response.json();
        const editor = document.getElementById('repo-editor');
        const pathEl = document.getElementById('repo-file-path');
        const saveButton = document.getElementById('repo-save-btn');
        if (editor) {
          editor.value = body.content;
          editor.disabled = false;
          rememberEditorFile(path, body.contentHash);
        }
        if (pathEl) pathEl.textContent = path;
        if (saveButton) saveButton.disabled = false;
      }

      const saveButton = document.getElementById('repo-save-btn');
      if (saveButton) {
        saveButton.addEventListener('click', async function (event) {
          const editor = document.getElementById('repo-editor');
          if (!editor || !editor.dataset.missionPath || !missionId()) return;
          event.preventDefault();
          event.stopImmediatePropagation();
          const status = document.getElementById('repo-save-status');
          if (status) status.textContent = 'Saving...';
          const key = localStorage.getItem('codemind_api_key') || '';
          const save = async function (baseContentHash) {
            const body = {
              path: editor.dataset.missionPath,
              content: editor.value,
              sessionId: missionId(),
            };
            if (baseContentHash !== null) body.baseContentHash = baseContentHash;
            return window.fetch('/api/repository/file', {
              method: 'PUT',
              headers: { authorization: 'Bearer ' + key, 'content-type': 'application/json' },
              body: JSON.stringify(body),
            });
          };
          let response = await save(editor.dataset.missionBaseHash || '');
          if (response.status === 409) {
            const conflict = await response.json();
            const overwrite = window.confirm(editor.dataset.missionPath + ' changed on disk. OK overwrites the disk version; Cancel reloads it.');
            if (!overwrite) {
              editor.value = conflict.currentContent || '';
              editor.dataset.missionBaseHash = conflict.currentContentHash || '';
              if (status) status.textContent = 'Reloaded current disk content.';
              return;
            }
            response = await save(null);
          }
          const body = await response.json().catch(function () { return {}; });
          if (!response.ok) {
            if (status) status.textContent = 'Save failed: ' + (body.error || response.status);
            return;
          }
          editor.dataset.missionBaseHash = body.contentHash || '';
          if (status) status.textContent = 'Saved at ' + new Date().toLocaleTimeString();
        }, true);
      }

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
        if (mission.workspace.activeFilePath && (!reconciliation || reconciliation.repositoryAvailable)) {
          void restoreMissionFile(mission.workspace.activeFilePath);
        }
      };
    })();
  `
}
