import { renderChatBodyMarkup, renderChatScripts } from '../../server/chat-ui-html.js'

function renderMissionAgentBridgeScript(): string {
  return `<script>(function () {
    const originalFetch = window.fetch.bind(window);
    window.fetch = function (input, init) {
      const url = typeof input === 'string' ? input : (input && input.url) || '';
      if (url === '/api/agent' && init && typeof init.body === 'string') {
        const missionId = localStorage.getItem('symbolwright_active_mission_id');
        if (missionId) {
          try {
            const body = JSON.parse(init.body);
            body.missionId = missionId;
            // The server is the source of truth for a mission conversation. Do
            // not accidentally send stale messages from a previously selected
            // mission after a browser refresh or mission switch.
            delete body.priorMessages;
            init = Object.assign({}, init, { body: JSON.stringify(body) });
          } catch (_) {
            // Preserve existing non-JSON behavior; the endpoint will validate it.
          }
        }
      }
      return originalFetch(input, init);
    };

    function messageText(message) {
      if (typeof message.content === 'string') return message.content;
      if (!Array.isArray(message.content)) return '';
      return message.content.map(function (block) {
        if (block.type === 'text') return block.text || '';
        if (block.type === 'tool_use') return '[Tool request: ' + (block.name || 'unknown') + ']';
        if (block.type === 'tool_result') return '[Tool result] ' + (block.content || '');
        return '';
      }).filter(Boolean).join('\\n');
    }

    window.symbolWrightApplyMissionToAgent = function (mission) {
      const header = document.getElementById('agent-mission-header');
      if (header) {
        header.innerHTML = '<strong>Mission: ' + appEscapeHtml(mission.name) + '</strong>' +
          '<span>Repository: ' + appEscapeHtml(mission.repository.repositoryName || mission.repository.rootPath) + '</span>' +
          '<span>Branch: ' + appEscapeHtml(mission.repository.branch || '(unavailable)') + '</span>' +
          '<span>Status: ' + appEscapeHtml(mission.status) + '</span>' +
          '<span class="muted">Last saved: ' + appEscapeHtml(new Date(mission.updatedAt).toLocaleString()) + '</span>';
      }

      const mode = document.getElementById('agent-mode-select');
      if (mode && mission.agent.runtimeMode) mode.value = mission.agent.runtimeMode;
      const model = document.getElementById('model-field');
      if (model) model.value = mission.agent.model || '';
      const provider = document.getElementById('provider-select');
      if (provider && mission.agent.activeProviderId) {
        const optionExists = Array.from(provider.options).some(function (option) {
          return option.value === mission.agent.activeProviderId;
        });
        if (optionExists) provider.value = mission.agent.activeProviderId;
      }
      const agentToggle = document.getElementById('agent-mode-toggle');
      if (agentToggle) {
        agentToggle.checked = true;
        agentToggle.dispatchEvent(new Event('change'));
      }

      const transcript = document.getElementById('transcript');
      if (!transcript) return;
      transcript.innerHTML = '';
      (mission.agent.messages || []).forEach(function (message) {
        const text = messageText(message);
        if (!text) return;
        const bubble = document.createElement('div');
        const role = message.role === 'user' ? 'user' :
          (message.role === 'tool_use' || message.role === 'tool_result' ? 'tool' : 'assistant');
        bubble.className = 'msg ' + role;
        bubble.textContent = text;
        transcript.appendChild(bubble);
      });
      transcript.scrollTop = transcript.scrollHeight;
    };
  })();</script>`
}

/**
 * The unified shell's `#/agent` view — the same connect/mode/provider/chat
 * markup and client behavior as the standalone chat server, embedded as a
 * sibling section instead of a separate page/port.
 */
export function renderAgentViewHtml(): string {
  return `<section data-view="agent" class="app-view" style="display:none">
    <div id="agent-mission-header" class="mission-context-header"><strong>No active mission.</strong> Agent requests continue to work normally; create or resume a Mission to make the conversation durable.</div>
    ${renderChatBodyMarkup()}
  </section>
  ${renderChatScripts()}
  ${renderMissionAgentBridgeScript()}`
}
