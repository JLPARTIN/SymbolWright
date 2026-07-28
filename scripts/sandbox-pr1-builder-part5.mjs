import { applyOperations } from './sandbox-pr1-builder-lib.mjs'

const operations = [
  {
    "type": "after",
    "file": "src/server/symbolwright-chat-server-sandbox.spec.ts",
    "anchor": "  it('serves runtime inventory from the real unified server', async () => {\n    const response = await fetch(`${started!.url}/api/sandbox/runtimes`, { headers: auth() })\n    expect(response.status).toBe(200)\n    const body = (await response.json()) as {\n      schemaVersion: number\n      runners: readonly { id: string; trustClass: string }[]\n    }\n    expect(body.schemaVersion).toBe(1)\n    expect(body.runners.some((runner) => runner.trustClass === 'browser-isolated')).toBe(true)\n  })\n",
    "text": "it('refuses guarded-host execution through the authenticated HTTP API', async () => {\n  const response = await fetch(`${started!.url}/api/sandbox/execute`, {\n    method: 'POST',\n    headers: auth(),\n    body: JSON.stringify({\n      languageId: 'javascript',\n      mode: 'run',\n      source: 'console.log(\"must not run\")',\n      requestedRunnerId: 'guarded-host-javascript',\n    }),\n  })\n  expect(response.status).toBe(403)\n  const body = (await response.json()) as { reasonCode: string }\n  expect(body.reasonCode).toBe('GUARDED_HOST_HTTP_FORBIDDEN')\n})\n"
  },
  {
    "type": "create",
    "file": "src/runtime/tools/bash-tool-boundary.spec.ts",
    "content": "import { describe, expect, it } from 'vitest'\n\nimport {\n  DEFAULT_TIMEOUT_MS,\n  type SandboxCommandRequest,\n  type SandboxRunner,\n} from '../sandbox/sandbox-runner.js'\nimport { executeBashTool } from './bash-tool.js'\n\nfunction capturingRunner(captured: SandboxCommandRequest[]): SandboxRunner {\n  return {\n    runCommand: async (request) => {\n      captured.push(request)\n      return {\n        outcome: 'EXECUTED',\n        runner: 'docker',\n        command: [request.binary, ...request.args].join(' '),\n        stdout: '',\n        stderr: '',\n        exitCode: 0,\n        reason: null,\n      }\n    },\n  }\n}\n\ndescribe('bash tool boundary hardening', () => {\n  it('caps caller timeout overrides at the server maximum', async () => {\n    const captured: SandboxCommandRequest[] = []\n    await executeBashTool(\n      { command: 'node --version', timeoutMs: DEFAULT_TIMEOUT_MS * 10 },\n      process.cwd(),\n      true,\n      capturingRunner(captured),\n    )\n    expect(captured[0]?.timeoutMs).toBe(DEFAULT_TIMEOUT_MS)\n  })\n\n  it('drops invalid timeout overrides instead of widening execution', async () => {\n    const captured: SandboxCommandRequest[] = []\n    await executeBashTool(\n      { command: 'node --version', timeoutMs: -1 },\n      process.cwd(),\n      true,\n      capturingRunner(captured),\n    )\n    expect(captured[0]?.timeoutMs).toBeUndefined()\n  })\n})\n"
  }
]

await applyOperations(operations)
