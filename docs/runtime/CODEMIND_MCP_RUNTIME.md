# CodeMind MCP Runtime

CodeMind MCP Runtime is a bounded external-tool layer for local stdio MCP servers. It does not ship fantasy connectors, browser automation, remote HTTP transports, or WebSocket transports in this bundle.

## Active Scope

This bundle supports:

```txt
.codemind/mcp.json config parsing
local stdio server lifecycle
MCP initialize handshake
tools/list discovery
tools/call execution
CodeMind runtime policy gating
allowTools / blockedTools config policy
secret redaction for configured server env values
runtime audit output
one working local stdio fixture server
```

HTTP and WebSocket MCP transports are intentionally out of scope for this PR bundle.

## Config File

Default path:

```txt
.codemind/mcp.json
```

Example using the committed fixture server:

```json
{
  "servers": {
    "fixture": {
      "transport": "stdio",
      "command": "node",
      "args": ["fixtures/mcp/stdio-fixture-server.mjs"],
      "env": {
        "MCP_FIXTURE_SECRET": "sk-test-secret-123456"
      },
      "timeoutMs": 3000,
      "allowedTools": ["echo", "add", "reveal_secret"],
      "blockedTools": []
    }
  }
}
```

Supported server fields:

```txt
transport     must be stdio
command       executable to launch
args          argument array passed directly to spawn
env           string environment values added to the child process
timeoutMs     request timeout between 100 and 60000
allowedTools  optional allowlist for discovered MCP tool names
blockedTools  denylist for discovered MCP tool names
```

## CLI

List configured servers without starting them:

```bash
codemind mcp list
```

Discover tools from a configured server:

```bash
codemind mcp tools fixture
```

Call a configured MCP tool through CodeMind runtime policy and audit output:

```bash
codemind mcp call fixture echo '{"message":"hello"}'
```

Use a non-default config path:

```bash
codemind mcp tools fixture --config fixtures/mcp/my-mcp.json
```

## Runtime Policy

MCP stdio launches a local process, so execution requires a CodeMind policy that allows shell execution. `APPROVED_EXECUTION` allows this path. `READ_ONLY`, `PLAN_ONLY`, and `PROPOSAL_ONLY` block tool execution before the external server can run.

The runtime path is:

```txt
CLI command
  -> runtime registry mcp_external_call
  -> CodeMind policy gate
  -> config-level tool allow/block decision
  -> stdio MCP lifecycle
  -> redaction
  -> audit output
```

## Fixture Proof

The fixture server is committed at:

```txt
fixtures/mcp/stdio-fixture-server.mjs
```

It supports:

```txt
echo
add
reveal_secret
```

The `reveal_secret` tool intentionally returns an environment secret so the test suite can prove CodeMind redacts configured MCP server env values from evidence output.

## Validation

Primary checks for this bundle:

```bash
npm run typecheck
npm run lint
npm run format:check
npm test
npm run build
```

The MCP-specific tests cover:

```txt
config parser validation
unsupported transport rejection
workspace-bound config loading
allowedTools / blockedTools enforcement
stdio initialize + tools/list lifecycle
tools/call execution
CLI command reachability
secret redaction
runtime policy shell block
```
