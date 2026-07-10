import {
  formatToolCallEndMessage,
  formatToolCallStartMessage,
  parseSseBuffer,
} from './chat-transcript-logic.js'

/**
 * Builds the CodeMind Chat browser `<script>` body. Behaviorally equivalent
 * to the inline script that used to live directly inside `chat-ui-html.ts`'s
 * template literal — SSE frame parsing and tool-call message formatting are
 * now sourced from `chat-transcript-logic.ts` via `fn.toString()` so they
 * are unit-tested in Node and still run unmodified in the browser.
 */
export function buildChatTranscriptClientScript(): string {
  return `
    const state = {
      codemindKey: localStorage.getItem('codemind_api_key') || '',
      mode: localStorage.getItem('codemind_mode') || 'browser',
      providerId: null,
      providerActive: false,
      messages: [],
      agentMessages: [],
    };

    const el = (id) => document.getElementById(id);

    function authHeaders(extra) {
      return Object.assign({ authorization: 'Bearer ' + state.codemindKey }, extra || {});
    }

    function setText(id, text, cls) {
      const node = el(id);
      node.textContent = text;
      if (cls) node.className = 'hint ' + cls;
    }

    function updateModeStatus() {
      if (!state.codemindKey) {
        setText('mode-status', 'Current mode: not connected yet', '');
        return;
      }
      if (state.mode === 'browser') {
        el('mode-status').textContent = 'Current mode: Browser-only (no AI provider connected)';
      } else if (state.providerActive) {
        el('mode-status').textContent = 'Current mode: API-backed: ' + state.providerId + ' active';
      } else {
        el('mode-status').textContent = 'Current mode: API-backed: ' + (state.providerId || 'no provider') + ' missing';
      }
    }

    async function loadProviders() {
      const response = await fetch('/api/providers', { headers: authHeaders() });
      if (response.status === 401) throw new Error('Invalid CodeMind API key');
      if (!response.ok) throw new Error('Failed to load providers: HTTP ' + response.status);
      return response.json();
    }

    function renderProviderOptions(data) {
      const select = el('provider-select');
      select.innerHTML = '';
      for (const entry of data.catalog) {
        const option = document.createElement('option');
        option.value = entry.id;
        const status = data.statuses.find((s) => s.providerId === entry.id);
        option.textContent = entry.displayName + (status ? ' (' + status.status + ')' : '');
        select.appendChild(option);
      }
      select.value = data.redactedConfig.activeProvider || 'anthropic';
      state.providerId = select.value;
      onProviderChange();
    }

    function onProviderChange() {
      const providerId = el('provider-select').value;
      state.providerId = providerId;
      state.providerActive = false;
      el('custom-fields').style.display = providerId === 'custom' ? 'block' : 'none';
      updateModeStatus();
    }

    el('provider-select')?.addEventListener?.('change', onProviderChange);

    el('agent-mode-toggle').addEventListener('change', () => {
      el('agent-mode-controls').style.display = el('agent-mode-toggle').checked ? 'block' : 'none';
    });

    function renderLocalStatusCards(data) {
      const grid = el('local-status-grid');
      grid.innerHTML = '';
      for (const card of data.cards) {
        const div = document.createElement('div');
        div.className = 'local-status-card';
        const label = document.createElement('div');
        label.className = 'label';
        label.textContent = card.label;
        const value = document.createElement('div');
        value.className = 'value ' + card.state;
        value.textContent = card.value;
        div.appendChild(label);
        div.appendChild(value);
        grid.appendChild(div);
      }
    }

    async function loadLocalStatus() {
      setText('local-status-summary', 'Loading local diagnostics...', '');
      try {
        const response = await fetch('/api/local-status', { headers: authHeaders() });
        if (!response.ok) throw new Error('Failed to load local diagnostics: HTTP ' + response.status);
        const data = await response.json();
        setText('local-status-summary', 'Overall: ' + data.overallState.toUpperCase() + ' (generated ' + data.generatedAt + ')', data.overallState);
        renderLocalStatusCards(data);
      } catch (error) {
        setText('local-status-summary', error.message, 'fail');
      }
    }

    el('refresh-local-status-btn').addEventListener('click', loadLocalStatus);

    function applyMode(mode) {
      state.mode = mode;
      localStorage.setItem('codemind_mode', mode);
      el('browser-mode-btn').classList.toggle('active', mode === 'browser');
      el('api-mode-btn').classList.toggle('active', mode === 'api');
      el('local-status-section').style.display = mode === 'browser' ? 'block' : 'none';
      el('provider-section').style.display = mode === 'api' ? 'block' : 'none';
      el('chat-section').style.display = mode === 'api' ? 'block' : 'none';
      updateModeStatus();
      if (mode === 'browser') {
        void loadLocalStatus();
      }
    }

    el('browser-mode-btn').addEventListener('click', () => applyMode('browser'));
    el('api-mode-btn').addEventListener('click', () => applyMode('api'));

    async function connect() {
      const key = el('codemind-key').value.trim();
      if (!key) { setText('connect-status', 'Enter a CodeMind API key first.', 'fail'); return; }
      state.codemindKey = key;
      try {
        const data = await loadProviders();
        localStorage.setItem('codemind_api_key', key);
        setText('connect-status', 'Connected.', 'ok');
        renderProviderOptions(data);
        el('mode-section').style.display = 'block';
        applyMode(state.mode);
        if (typeof window.codemindOnConnected === 'function') window.codemindOnConnected();
      } catch (error) {
        setText('connect-status', error.message, 'fail');
        updateModeStatus();
      }
    }

    el('connect-btn').addEventListener('click', connect);
    el('codemind-key').addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        connect();
      }
    });

    async function testProvider(providerId) {
      setText('provider-status', 'Testing...', '');
      try {
        const response = await fetch('/api/providers/test', {
          method: 'POST',
          headers: authHeaders({ 'content-type': 'application/json' }),
          body: JSON.stringify({ providerId }),
        });
        const data = await response.json();
        state.providerActive = Boolean(data.ok);
        setText('provider-status', data.ok ? ('Active: ' + data.detail) : ('Invalid config: ' + data.detail), data.ok ? 'ok' : 'fail');
        updateModeStatus();
        return data;
      } catch (error) {
        state.providerActive = false;
        setText('provider-status', error.message, 'fail');
        updateModeStatus();
        return { ok: false, detail: error.message };
      }
    }

    async function saveProvider() {
      const providerId = el('provider-select').value;
      const body = { providerId };
      const apiKey = el('api-key-field').value.trim();
      const model = el('model-field').value.trim();
      const baseUrl = el('base-url-field').value.trim();
      if (apiKey) body.apiKey = apiKey;
      if (model) body.model = model;
      if (baseUrl) body.baseUrl = baseUrl;

      try {
        const response = await fetch('/api/providers/register', {
          method: 'POST',
          headers: authHeaders({ 'content-type': 'application/json' }),
          body: JSON.stringify(body),
        });
        if (!response.ok) throw new Error((await response.json()).error || 'Failed to save provider');
        state.providerId = providerId;
        el('api-key-field').value = '';
        await testProvider(providerId);
      } catch (error) {
        state.providerActive = false;
        setText('provider-status', error.message, 'fail');
        updateModeStatus();
      }
    }

    el('save-provider-btn').addEventListener('click', saveProvider);
    el('api-key-field').addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        saveProvider();
      }
    });

    el('test-provider-btn').addEventListener('click', () => testProvider(el('provider-select').value));

    function appendMessage(role, text) {
      const bubble = document.createElement('div');
      bubble.className = 'msg ' + role;
      bubble.textContent = text;
      el('transcript').appendChild(bubble);
      el('transcript').scrollTop = el('transcript').scrollHeight;
      return bubble;
    }

    ${parseSseBuffer.toString()}
    ${formatToolCallStartMessage.toString()}
    ${formatToolCallEndMessage.toString()}

    async function readSseFrames(response, onFrame) {
      if (!response.ok || response.body === null) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || ('HTTP ' + response.status));
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parsed = parseSseBuffer(buffer);
        buffer = parsed.remainder;
        for (const frame of parsed.frames) onFrame(frame.eventType, JSON.parse(frame.data));
      }
    }

    async function sendChatMessage(providerId, text) {
      state.messages.push({ role: 'user', content: text });
      const assistantBubble = appendMessage('assistant', '');
      let assistantText = '';

      try {
        const model = el('model-field').value.trim();
        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: authHeaders({ 'content-type': 'application/json' }),
          body: JSON.stringify({
            providerId,
            ...(model ? { model } : {}),
            stream: true,
            messages: state.messages,
          }),
        });

        await readSseFrames(response, (eventType, payload) => {
          if (eventType === 'error') {
            assistantText += '\\n[error: ' + (payload.message || 'unknown error') + ']';
            assistantBubble.textContent = assistantText;
            assistantBubble.className = 'msg error';
          } else if (typeof payload.delta === 'string') {
            assistantText += payload.delta;
            assistantBubble.textContent = assistantText;
          }
        });

        state.messages.push({ role: 'assistant', content: assistantText });
      } catch (error) {
        assistantBubble.textContent = 'Error: ' + error.message;
        assistantBubble.className = 'msg error';
      }
    }

    async function sendAgentMessage(providerId, text) {
      const mode = el('agent-mode-select').value;
      const model = el('model-field').value.trim();
      let currentBubble = null;

      try {
        const response = await fetch('/api/agent', {
          method: 'POST',
          headers: authHeaders({ 'content-type': 'application/json' }),
          body: JSON.stringify({
            providerId,
            ...(model ? { model } : {}),
            mode,
            message: text,
            stream: true,
            ...(state.agentMessages.length > 0 ? { priorMessages: state.agentMessages } : {}),
          }),
        });

        await readSseFrames(response, (eventType, payload) => {
          if (eventType === 'text_delta') {
            if (currentBubble === null) currentBubble = appendMessage('assistant', '');
            currentBubble.textContent += payload.text;
          } else if (eventType === 'tool_call_start') {
            currentBubble = null;
            appendMessage('tool', formatToolCallStartMessage(payload.name));
          } else if (eventType === 'tool_call_end') {
            appendMessage('tool', formatToolCallEndMessage(payload.name, payload.output || '', Boolean(payload.isError)));
          } else if (eventType === 'error') {
            appendMessage('error', payload.message || 'unknown error');
          } else if (eventType === 'result' && Array.isArray(payload.finalMessages)) {
            state.agentMessages = payload.finalMessages;
          }
        });
      } catch (error) {
        appendMessage('error', error.message);
      }
    }

    async function sendMessage() {
      const input = el('chat-input');
      const text = input.value.trim();
      if (!text) return;
      const providerId = el('provider-select').value;
      const agentMode = el('agent-mode-toggle').checked;

      input.value = '';
      appendMessage('user', text);
      el('send-btn').disabled = true;
      setText('status-line', agentMode ? 'Running agent...' : 'Sending...', '');

      if (agentMode) {
        await sendAgentMessage(providerId, text);
      } else {
        await sendChatMessage(providerId, text);
      }

      setText('status-line', '', '');
      el('send-btn').disabled = false;
    }

    function applyWorkspaceDraftFromUrl() {
      const params = new URLSearchParams(window.location.search);
      const draft = params.get('draft');
      const agentMode = params.get('agentMode');

      if (draft === null || draft.trim().length === 0) {
        return;
      }

      el('chat-input').value = draft;
      appendMessage('tool', 'Workspace code-intelligence draft loaded. Connect and choose API-backed mode to send it.');
      setText('connect-status', 'Workspace draft loaded. Connect with CODEMIND_API_KEY, then use API-backed mode to send it.', 'ok');

      if (agentMode === 'READ_ONLY' || agentMode === 'PROPOSAL_ONLY' || agentMode === 'APPROVED_EXECUTION') {
        el('agent-mode-toggle').checked = true;
        el('agent-mode-select').value = agentMode;
        el('agent-mode-controls').style.display = 'block';
      }
    }

    el('send-btn').addEventListener('click', sendMessage);
    el('chat-input').addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        sendMessage();
      }
    });

    // Inside the unified app shell, window.registerRouterViewInit (a plain
    // top-level function declaration, so it lands on window in sloppy-mode
    // global scope) is defined by client-router.ts, and
    // workspace-agent-bridge.ts owns parsing ?draft=/&agentMode= centrally
    // so it can also switch to the Agent tab. Standalone (this script's own
    // renderChatUiHtml() page), no such router exists, so this page handles
    // the query params itself as it always has.
    if (typeof window.registerRouterViewInit !== 'function') {
      applyWorkspaceDraftFromUrl();
    }

    if (state.codemindKey) {
      el('codemind-key').value = state.codemindKey;
      connect();
    }
  `
}
