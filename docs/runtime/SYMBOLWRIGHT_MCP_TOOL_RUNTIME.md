# SymbolWright MCP + External Tool Runtime

Gives SymbolWright a real substrate for local stdio Model Context Protocol (MCP)
servers: config, process lifecycle, tool discovery, policy-gated invocation,
timeout handling, output capture, and redaction before anything reaches an
audit log or the CLI.

Scope is intentionally tight: **local stdio servers only**. No HTTP/WebSocket
transport, no fake connectors, no "future provider" placeholders.

## Config: `.symbolwright/mcp.json`

```json
{
  "servers": {
    "fixture": {
      "command": "node",
      "args": ["fixtures/mcp/fixture-server.mjs"],
      "env": { "EXAMPLE_VAR": "value" },
      "cwd": ".",
      "timeoutMs": 15000
    }
  }
}
```

- `command` is required; everything else is optional.
- `args` defaults to `[]`, `env` to `{}`.
- `timeoutMs` defaults to 15000 and applies to `initialize`, `tools/list`, and
  `tools/call` unless a call overrides it.
- `.symbolwright/` is git-ignored, so this file is local/per-checkout — see
  [Try it](#try-it-the-real-fixture-server) below to set one up.
- A missing `.symbolwright/mcp.json` is not an error: `loadMcpConfig` returns an
  empty server map, so MCP stays fully optional until a repo opts in.

Parser: `src/mcp/mcp-config.ts` (`parseMcpConfig`, `loadMcpConfig`,
`requireMcpServer`).

## Protocol

`src/mcp/mcp-stdio-transport.ts` speaks newline-delimited JSON-RPC 2.0 over a
spawned process's stdio — one JSON-RPC message per line on stdout/stdin, free
-form logs on stderr, per the MCP stdio transport spec. `src/mcp/mcp-client.ts`
layers the MCP method surface on top: `initialize` handshake +
`notifications/initialized`, `tools/list`, `tools/call`.

Each server connection is short-lived: the CLI and the `mcp_call` runtime tool
spawn a server, do the handshake, perform one discovery or call, then close
the process. There is no background daemon in this bundle.

## Policy gate

MCP tool calls spawn local subprocesses — the same risk tier as `bash`/`git`
execution — so `src/mcp/mcp-policy.ts` gates them on the existing
`policy.allowShell` flag rather than adding a parallel policy dimension.
`READ_ONLY`, `PLAN_ONLY`, and `PROPOSAL_ONLY` modes block MCP execution;
`APPROVED_EXECUTION` allows it.

## Timeout handling

Every `initialize`/`tools/list`/`tools/call` request races against a timer in
`McpStdioTransport.request()`. On timeout the pending request rejects with a
descriptive error; the transport does not hang waiting on a wedged server.
`callMcpTool` accepts a per-call `timeoutMs` override on top of the
server's configured default.

## Output capture + redaction

- stdout is parsed strictly as JSON-RPC; non-JSON lines are ignored (per
  spec, stdout is reserved for protocol messages).
- stderr is captured into a bounded buffer (`McpStdioTransport.stderrLog`,
  default cap 64KB) for diagnostics.
- Before anything reaches an audit event, CLI output, or the `mcp_call`
  runtime tool's return value, `src/mcp/mcp-redaction.ts` runs the existing
  secret/path redactor (`redactValidationOutput`) over both the stderr log
  and every text content block in the tool result.

## Evidence + audit trace

`src/mcp/mcp-runtime.ts` is the single execution path — policy gate →
spawn/connect → invoke → redact → audit trace → evidence output — used by
both the CLI and the runtime tool:

- `probeMcpServer` / `listMcpServers` — reachability + tool count per server.
- `discoverMcpTools` — tool discovery for one or all configured servers.
- `callMcpTool` — the actual invocation path. Returns an `McpCallEvidence`
  record (`server`, `toolName`, `status`, `content`, `stderrLog`, timing, and
  `auditTrace`) and, when an `RuntimeAuditLog` is passed in, records a
  `RuntimeAuditEvent` there too.

`status` is one of `blocked` (policy denied), `unknown_target` (bad
server/tool name), `ok`, `tool_error` (the tool itself reported
`isError: true`), or `transport_error` (spawn/connect/timeout failure).

## Runtime tool: `mcp_call`

Registered in `src/runtime/tools/tool-assembly.ts` with capability
`MCP_TOOL`. Input:

```json
{ "server": "fixture", "tool": "echo", "arguments": { "text": "hi" }, "timeoutMs": 5000 }
```

It loads `.symbolwright/mcp.json` from `context.cwd`, runs it through
`callMcpTool`, and renders the evidence (status, content, stderr, audit
trace) as text.

## CLI commands

```txt
codemind mcp list                          # probe every configured server for reachability + tool count
codemind mcp tools [server]                # discover tools for one server, or all servers if omitted
codemind mcp call <server.tool> [json-args] # invoke a tool through the policy gate
```

Shared flags: `--config <path>` (override the default `.symbolwright/mcp.json`
lookup), `--mode <MODE>` (defaults to `APPROVED_EXECUTION`), `--timeout <ms>`
(`mcp call` only). When exactly one server is configured, `mcp call` accepts
a bare tool name (e.g. `echo`) instead of the qualified `fixture.echo` form.

## Try it: the real fixture server

`fixtures/mcp/fixture-server.mjs` is a dependency-free MCP stdio server (three
tools: `echo`, `sum`, `sleep`) used by the unit/integration tests and this
walkthrough — not a mock. From the repo root:

```sh
mkdir -p .symbolwright
cp examples/mcp/mcp.json .symbolwright/mcp.json

npm run build

node dist/cli.js mcp list
node dist/cli.js mcp tools
node dist/cli.js mcp call fixture.echo '{"text":"SymbolWright MCP runtime is live"}'
```

Expected output for the last command:

```txt
SymbolWright mcp_call

Server: fixture
Tool: echo
Status: ok
Duration: <n>ms

SymbolWright MCP runtime is live

stderr:
fixture-server: ready
fixture-server: client initialized

Audit trace:
- [<timestamp>] ALLOWED mcp_call:fixture.echo: MCP tool call completed
```

## Tests

- `src/mcp/mcp-config.spec.ts` — config parsing/validation.
- `src/mcp/mcp-stdio-transport.spec.ts` — request/response round trip, stderr
  capture, timeouts, spawn failures, close semantics — all against the real
  fixture server, not mocks.
- `src/mcp/mcp-client.spec.ts` — handshake, discovery, tool calls, tool-level
  errors, per-call timeout override.
- `src/mcp/mcp-policy.spec.ts`, `src/mcp/mcp-redaction.spec.ts` — gate and
  redaction unit tests.
- `src/mcp/mcp-runtime.spec.ts` — the full policy → execution → redaction →
  audit → evidence pipeline, all five `McpCallStatus` outcomes.
- `src/runtime/tools/mcp-call-tool.spec.ts` — the runtime tool end-to-end.
- `src/cli-mcp.spec.ts` — `mcp list` / `mcp tools` / `mcp call` end-to-end,
  including the `--config`, bare-tool-name, and `--timeout` paths.

## Hard boundaries (by design, this bundle)

- Local stdio servers only — no HTTP/WebSocket transport.
- No connectors beyond the one fixture server used for tests/docs.
- No persistent server daemon — every CLI/tool invocation spawns, uses, and
  closes its own process.
- `mcp_call` gated by `policy.allowShell`, same as `bash`/`git`.
