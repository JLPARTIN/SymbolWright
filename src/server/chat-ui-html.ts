export function renderChatUiHtml(): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>CodeMind Chat</title>
  <style>
    :root { color-scheme: dark; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
    body { margin: 0; background: #0b1020; color: #e8ecff; }
    main { max-width: 880px; margin: 0 auto; padding: 24px 16px 80px; }
    h1 { font-size: 26px; margin: 0 0 4px; }
    .sub { color: #8ea0d7; margin: 0 0 20px; font-size: 13px; }
    section { border: 1px solid #2a355f; border-radius: 14px; background: #111832; padding: 16px; margin-bottom: 16px; }
    section h2 { margin: 0 0 10px; font-size: 15px; color: #cdd7ff; }
    label { display: block; font-size: 12px; color: #8ea0d7; margin: 8px 0 4px; }
    input, select, textarea { width: 100%; box-sizing: border-box; background: #080c18; color: #e8ecff; border: 1px solid #2a355f; border-radius: 8px; padding: 8px 10px; font-size: 13px; font-family: inherit; }
    button { background: #3a5bff; color: white; border: none; border-radius: 8px; padding: 8px 14px; font-size: 13px; cursor: pointer; margin-top: 8px; margin-right: 6px; }
    button.secondary { background: #232c50; }
    button.active { outline: 2px solid #8ff0b7; }
    button:disabled { opacity: 0.5; cursor: not-allowed; }
    .row { display: flex; gap: 10px; }
    .row > div { flex: 1; }
    #custom-fields { display: none; }
    #status-line { font-size: 12px; color: #8ea0d7; margin-top: 8px; min-height: 16px; }
    #transcript { display: flex; flex-direction: column; gap: 10px; max-height: 50vh; overflow-y: auto; margin-bottom: 10px; }
    .msg { padding: 10px 12px; border-radius: 10px; white-space: pre-wrap; word-break: break-word; font-size: 14px; line-height: 1.5; }
    .msg.user { background: #1c2650; align-self: flex-end; max-width: 80%; }
    .msg.assistant { background: #16203f; align-self: flex-start; max-width: 80%; border: 1px solid #2a355f; }
    .msg.error { background: #401d24; color: #ff9d9d; }
    .msg.tool { background: #10241a; border: 1px solid #1f4a34; color: #b9e6cb; align-self: flex-start; max-width: 90%; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12.5px; }
    #chat-input-row { display: flex; gap: 8px; }
    #chat-input { flex: 1; resize: vertical; min-height: 44px; }
    .hint { font-size: 11px; color: #57649a; }
    .warn { color: #f5c451; }
    .ok { color: #8ff0b7; }
    .fail { color: #ff8f8f; }
    .checkbox-row { display: flex; align-items: center; gap: 8px; margin: 8px 0; }
    .checkbox-row input[type="checkbox"] { width: auto; }
    .checkbox-row label { margin: 0; font-size: 13px; color: #cdd7ff; }
    #agent-mode-controls { display: none; }
    #mode-section, #local-status-section, #provider-section, #chat-section { display: none; }
    .local-status-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 10px; margin-top: 10px; }
    .local-status-card { border: 1px solid #2a355f; border-radius: 10px; padding: 10px; background: #0c1226; }
    .local-status-card .label { font-size: 11px; color: #8ea0d7; margin-bottom: 4px; }
    .local-status-card .value { font-size: 14px; font-weight: 700; }
  </style>
</head>
<body>
  <main>
    <h1>CodeMind Chat</h1>
    <p class="sub">Bring your own provider API key, or stay in browser-only mode with no key at all. CodeMind routes provider requests through its provider gateway &mdash; your provider key never leaves the server.</p>
    <p id="mode-status" class="sub"><strong>Current mode:</strong> not connected yet</p>

    <section id="connect-section" style="display:block">
      <h2>1. Connect to this CodeMind server</h2>
      <label for="codemind-key">CodeMind access key (CODEMIND_API_KEY)</label>
      <input id="codemind-key" type="password" placeholder="paste your CodeMind API key" autocomplete="off" />
      <button id="connect-btn">Connect</button>
      <div id="connect-status" class="hint"></div>
      <div class="hint warn">This key is saved in this browser's local storage so you don't have to retype it. Do not use that on a shared or public computer &mdash; clear it from browser storage when you're done.</div>
    </section>

    <section id="mode-section">
      <h2>2. Choose your mode</h2>
      <button id="browser-mode-btn" class="secondary">Browser-only mode &mdash; no API key</button>
      <button id="api-mode-btn" class="secondary">API-backed mode &mdash; bring your own key</button>
      <div class="hint">Browser-only mode runs CodeMind's local diagnostics (doctor + release-readiness) with no provider connected. Switch to API-backed mode any time to add a provider and chat.</div>
    </section>

    <section id="local-status-section">
      <h2>Browser-only mode &mdash; local diagnostics</h2>
      <p class="hint">Real, deterministic, local checks. No AI provider is connected in this mode, so chat and agent mode are unavailable until you switch to API-backed mode.</p>
      <button id="refresh-local-status-btn" class="secondary">Refresh local diagnostics</button>
      <div id="local-status-summary" class="hint">Loading local diagnostics...</div>
      <div id="local-status-grid" class="local-status-grid"></div>
    </section>

    <section id="provider-section">
      <h2>3. Choose or register a provider</h2>
      <div class="row">
        <div>
          <label for="provider-select">Provider</label>
          <select id="provider-select"></select>
        </div>
        <div>
          <label for="model-field">Model (optional, uses provider default)</label>
          <input id="model-field" type="text" placeholder="e.g. gpt-4o-mini" />
        </div>
      </div>
      <div id="custom-fields">
        <label for="base-url-field">API base URL</label>
        <input id="base-url-field" type="text" placeholder="https://your-api-host.example.com/v1" />
      </div>
      <label for="api-key-field">Provider API key (only sent to this server, stored server-side)</label>
      <input id="api-key-field" type="password" placeholder="provider API key" autocomplete="off" />
      <button id="save-provider-btn">Save and activate</button>
      <button id="test-provider-btn" class="secondary">Test connection</button>
      <div id="provider-status" class="hint"></div>
    </section>

    <section id="chat-section">
      <h2>4. Chat</h2>
      <div class="checkbox-row">
        <input type="checkbox" id="agent-mode-toggle" />
        <label for="agent-mode-toggle">Agent mode &mdash; let the model read/edit files and run commands via /api/agent</label>
      </div>
      <div id="agent-mode-controls">
        <label for="agent-mode-select">Runtime mode</label>
        <select id="agent-mode-select">
          <option value="READ_ONLY">READ_ONLY &mdash; read and search files only (default, safest)</option>
          <option value="PROPOSAL_ONLY">PROPOSAL_ONLY &mdash; + draft patches/notes, no writes</option>
          <option value="APPROVED_EXECUTION">APPROVED_EXECUTION &mdash; + edit files, run shell commands</option>
        </select>
        <div class="hint">Tool calls the model makes are shown inline below as they happen.</div>
      </div>
      <div id="transcript"></div>
      <div id="chat-input-row">
        <textarea id="chat-input" placeholder="Message your provider... (Enter to send, Shift+Enter for newline)"></textarea>
        <button id="send-btn">Send</button>
      </div>
      <div id="status-line"></div>
    </section>
  </main>

  <script>
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

        let boundary = buffer.indexOf('\\n\\n');
        while (boundary !== -1) {
          const frame = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);
          boundary = buffer.indexOf('\\n\\n');

          const lines = frame.split('\\n');
          let eventType = 'message';
          let dataLine = '';
          for (const line of lines) {
            if (line.startsWith('event:')) eventType = line.slice(6).trim();
            if (line.startsWith('data:')) dataLine = line.slice(5).trim();
          }
          if (!dataLine) continue;
          onFrame(eventType, JSON.parse(dataLine));
        }
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
            appendMessage('tool', '🔧 calling ' + payload.name + '...');
          } else if (eventType === 'tool_call_end') {
            const output = payload.output || '';
            const preview = output.length > 400 ? output.slice(0, 400) + '…' : output;
            appendMessage('tool', (payload.isError ? '⚠️ ' : '✓ ') + payload.name + ' → ' + preview);
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

    el('send-btn').addEventListener('click', sendMessage);
    el('chat-input').addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        sendMessage();
      }
    });

    if (state.codemindKey) {
      el('codemind-key').value = state.codemindKey;
      connect();
    }
  </script>
</body>
</html>`
}
