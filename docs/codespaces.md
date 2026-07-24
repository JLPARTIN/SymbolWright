# Running CodeMind in GitHub Codespaces

CodeMind ships as **one server, one port**, started by `npm run serve`
(`codemind serve` under the hood). It serves a single application shell with
persistent navigation across a Dashboard, the Universal Polyglot Workspace
(browser-local scratch editor), a real **Repository** tab (browses and edits
the actual checked-out working tree, with git status/diffs, branches,
commits, push, and PR creation — see
[`repository-workspace.md`](repository-workspace.md)), an embedded Agent
chat/tool-execution panel, and Tools/Memory/Checkpoints browsers — no
separate dashboard process and no separate chat server to juggle.

| Command | Port | What it is |
| --- | --- | --- |
| `npm run codespaces:start` | `8787` | **Recommended.** One command: installs deps if needed, builds, generates an access key, starts the server, waits for health, validates the served browser JS, and prints a summary with the real forwarded URL and access key. |
| `npm run codespaces:stop` | — | Stops the server `codespaces:start` launched. Safe to run even if nothing is running. |
| `npm run codespaces:status` | — | Reports whether the server is healthy, its PID, branch/commit, detected provider (never the key), log location, and served-script validation — all read-only. |
| `npm run serve` (or `npm run dev`) | `8787` | The unified CodeMind app directly, without the orchestration above. Requires `CODEMIND_API_KEY` to already be set. Use this if you want manual control over each step (see "Manual startup" below). |

## Recommended: one-command startup

```bash
npm run codespaces:start
```

That single command handles everything the manual steps below do by hand:
stopping a stale CodeMind process on port `8787` (without touching unrelated
`node` processes), installing dependencies only when `node_modules` is
missing or stale, building current source, generating and persisting a
local `CODEMIND_API_KEY` for this Codespace session (reused across
restarts, chmod `600`, never committed), starting the server, polling
`/api/health` until it's actually healthy, and fetching the real served
root HTML to syntax-check every inline `<script>` block with Node's own
parser — the same check that would have caught the unified UI's broken
generated client JavaScript before it shipped. It prints the real forwarded
Codespaces URL (from `CODESPACE_NAME` /
`GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN`, falling back to
`http://127.0.0.1:8787` outside Codespaces) and the access key once, in a
clearly marked section — never a provider secret.

Re-run the same command any time you change code or environment variables;
it restarts cleanly with no `Ctrl+C` required, which also makes it usable
from a phone. Stop with `npm run codespaces:stop`; inspect with
`npm run codespaces:status`.

If you want a provider connected (Anthropic, OpenAI, Google Gemini, Groq,
OpenRouter, GitHub Models, DeepSeek, Ollama, or a custom OpenAI-compatible
endpoint — see [`docs/PROVIDER_KEYS.md`](PROVIDER_KEYS.md)), export its key
*before* running `codespaces:start` so the launched server picks it up:

```bash
export ANTHROPIC_API_KEY=sk-ant-...
npm run codespaces:start
```

## Manual startup

The rest of this document is the step-by-step manual path — useful if you
want fine-grained control over each step, or you're not in Codespaces.
`codespaces:start` above is the one-command equivalent of everything below.

### 1. Install and build

```bash
set -euo pipefail

echo "==> Node / npm versions"
node -v
npm -v

echo "==> Install dependencies"
npm ci
```

### 2. Typecheck / lint / test / build

```bash
set -euo pipefail

npm run typecheck --if-present
npm run lint --if-present
npm test --if-present
npm run build --if-present
```

### 3. Fastest path to full access (one terminal)

If you already have a provider credential and just want everything working
&mdash; Workspace, Agent mode (`APPROVED_EXECUTION`: real file edits + shell
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

1. Open **Settings** and paste the printed `CODEMIND_API_KEY` into "CodeMind
   access key" (or use the Agent tab's own connect box — both write to the
   same browser-local key).
2. Open the **Agent** tab, pick your provider (it already shows
   **configured** since the env var was set before `npm run serve` started),
   and click **Test connection** to confirm **Active**.
3. Check **Agent mode**, set the runtime-mode dropdown to
   `APPROVED_EXECUTION`, and send a message &mdash; this is full access:
   the model can read/edit files and run shell commands in this workspace,
   shown inline as tool calls happen.
4. Open the **Workspace** tab, edit code, and use an AI task button
   ("Explain code", "Review for bugs", ...) &mdash; it switches straight to
   the Agent tab with the draft pre-filled, in the same page, no new tab.

Environment variables only apply to processes started *after* you export
them in that shell &mdash; if you add a provider key later, stop this
process (`Ctrl+C`) and re-run `npm run serve` in the same terminal.

### 4. Opening a forwarded port in Codespaces (localhost too)

- Open the **Ports** tab (bottom panel, next to Terminal).
- Find port `8787`, right-click it, and set **Port Visibility** to
  **Public** if you want to open it from a phone or a browser outside this
  Codespace. Otherwise the default **Private** visibility works fine from
  your own logged-in browser.
- Click the **Open in Browser** (globe) icon, or copy the forwarded URL —
  it looks like `https://<codespace-name>-8787.app.github.dev`.
- On localhost (outside Codespaces) just use `http://localhost:8787`.

### 5. Troubleshooting port conflicts

Find and stop whatever is already using CodeMind's port instead of killing
all Node processes:

```bash
lsof -ti tcp:8787 | xargs -r kill
```

If `lsof` isn't installed, use `fuser -k 8787/tcp` as a fallback. Avoid
broad commands like `pkill node` — they will also kill unrelated Node
processes (editors, extensions, other terminals).

You can run the server on a different port:

```bash
CODEMIND_CHAT_PORT=8788 npm run serve
```

## MCP server for Claude Desktop / Claude Code (no port, no browser)

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
