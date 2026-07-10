# Running CodeMind in GitHub Codespaces

CodeMind ships two separate local servers, both plain Node processes started
by the npm scripts in `package.json`:

| Server | Command | Port | What it is |
| --- | --- | --- | --- |
| Runtime preview / Get Started dashboard | `npm run dev` | `3005` | Real, local, deterministic diagnostics (`npm run doctor` + `npm run release-readiness`) at `/`, plus the Universal Polyglot Workspace at `/workspace` (multi-file local sessions, JS/TS/SQL/Python runners, project bundle import/export). No provider API key needed for either. Links you to the chat server below. |
| Chat + agent server | `npm run serve` | `8787` | The interactive browser chat UI (`codemind serve`). Lets you pick **Browser-only mode** (no provider key, local diagnostics only) or **API-backed mode** (bring your own provider key, real chat + Agent mode with `APPROVED_EXECUTION` file writes and shell commands). |

They are kept as two processes on purpose: the dashboard never needs any
secret, so you can preview it with zero setup, while the chat server only
starts once you've set a `CODEMIND_API_KEY` (see below).

## 1. Install and build

```bash
set -euo pipefail

echo "==> Node / npm versions"
node -v
npm -v

echo "==> Install dependencies"
npm ci
```

## 2. Typecheck / lint / test / build

```bash
set -euo pipefail

npm run typecheck --if-present
npm run lint --if-present
npm test --if-present
npm run build --if-present
```

## 3. Fastest path to full access (one terminal)

If you already have a provider credential and just want everything working
&mdash; chat, Agent mode (`APPROVED_EXECUTION`: real file edits + shell
commands), and the dashboard &mdash; run all of this in one terminal before
starting the server, then open the forwarded port:

```bash
set -euo pipefail

export CODEMIND_API_KEY=$(openssl rand -hex 16)
export ANTHROPIC_API_KEY=sk-ant-...   # or any provider from docs/PROVIDER_KEYS.md

echo "CodeMind access key (paste this into the browser): $CODEMIND_API_KEY"
npm run serve
```

Then, on the forwarded/localhost port `8787`:

1. Paste the printed `CODEMIND_API_KEY` into "CodeMind access key" and
   connect (or press Enter).
2. Click **API-backed mode**, pick your provider (it already shows
   **configured** since the env var was set before `npm run serve` started),
   and click **Test connection** to confirm **Active**.
3. Check **Agent mode**, set the runtime-mode dropdown to
   `APPROVED_EXECUTION`, and send a message &mdash; this is full access:
   the model can read/edit files and run shell commands in this workspace,
   shown inline as tool calls happen.

Environment variables only apply to processes started *after* you export
them in that shell &mdash; if you add a provider key later, stop this
process (`Ctrl+C`) and re-run `npm run serve` in the same terminal.

## 3b. Two-terminal setup (dashboard + chat separately)

**Terminal 1 — Get Started dashboard (no API key required):**

```bash
npm run dev
```

Open port `3005` (see "Opening a forwarded port" below). This page is real,
local, and deterministic: it shows live `doctor`/`release-readiness` output
and a link to the chat server.

**Terminal 2 — Chat + agent UI:**

```bash
export CODEMIND_API_KEY=$(openssl rand -hex 16)
npm run serve
```

Open port `8787`. In the browser:

1. Paste the `CODEMIND_API_KEY` value you just generated into "CodeMind
   access key" and click **Connect** (or press Enter).
2. Choose **Browser-only mode** to keep going with no provider key (local
   diagnostics only, chat/agent disabled), or **API-backed mode** to add a
   provider.
3. In API-backed mode, set at least one provider credential first (see
   [`docs/PROVIDER_KEYS.md`](PROVIDER_KEYS.md) for the full list), e.g.:

   ```bash
   export ANTHROPIC_API_KEY=sk-ant-...
   ```

   then restart `npm run serve` in Terminal 2 so the server can see it, pick
   the provider in the dropdown, and click **Save and activate** (or press
   Enter in the provider API key field). The UI reports **active** or
   **invalid config** immediately — it never silently accepts a bad key.

## 4. Opening a forwarded port in Codespaces (localhost too)

- Open the **Ports** tab (bottom panel, next to Terminal).
- Find port `3005` (dashboard) or `8787` (chat), right-click it, and set
  **Port Visibility** to **Public** if you want to open it from a phone or a
  browser outside this Codespace. Otherwise the default **Private**
  visibility works fine from your own logged-in browser.
- Click the **Open in Browser** (globe) icon, or copy the forwarded URL —
  it looks like `https://<codespace-name>-<port>.app.github.dev`.
- On localhost (outside Codespaces) just use `http://localhost:3005` and
  `http://localhost:8787`.

## 5. Troubleshooting port conflicts

Find and stop whatever is already using CodeMind's ports instead of killing
all Node processes:

```bash
# Example only: replace ports with the actual app ports (3005, 8787)
lsof -ti tcp:3005 | xargs -r kill
lsof -ti tcp:8787 | xargs -r kill
```

If `lsof` isn't installed, use `fuser -k 3005/tcp` / `fuser -k 8787/tcp` as
a fallback. Avoid broad commands like `pkill node` — they will also kill
unrelated Node processes (editors, extensions, other terminals).

You can also run either server on a different port:

```bash
PORT=3006 npm run dev
CODEMIND_CHAT_PORT=8788 npm run serve
```

## 6. MCP server for Claude Desktop / Claude Code (no port, no browser)

`codemind mcp-server` is a separate integration path: it speaks MCP
(JSON-RPC) over **stdio**, not HTTP, so there is no port to forward — your
MCP-compatible client (Claude Desktop, Claude Code, another agent
framework) launches the process itself. Point it at the built CLI:

```json
{
  "mcpServers": {
    "codemind": { "command": "node", "args": ["/absolute/path/to/CodeMind/dist/cli.js", "mcp-server"] }
  }
}
```

Defaults to `READ_ONLY` (15 read-only tools: `read_file`, `list_files`,
`search_files`, `grep`, `glob`, plus reporting/skill tools). Add
`"--mode", "APPROVED_EXECUTION"` to `args` for the full 41-tool surface
(file writes, `bash`, `git`, GitHub write tools, validation runners, web
tools). See [`docs/runtime/CODEMIND_MCP_SERVER.md`](runtime/CODEMIND_MCP_SERVER.md)
for the full tool list and protocol details.
