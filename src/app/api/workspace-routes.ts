import { readFile } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { join } from 'node:path'

import {
  createWorkspaceCodeIntelligenceBridgeResponse,
  parseWorkspaceCodeIntelligenceRequest,
} from '../../workspace/code-intelligence-bridge.js'
import { runServerCode, type CodeRunRequest } from '../../workspace/code-runners.js'
import {
  CODE_RUNNER_DEFINITIONS,
  UNIVERSAL_LANGUAGE_REGISTRY,
} from '../../workspace/language-registry.js'
import { isSqlBrowserVendorAsset } from '../../workspace/sql-browser-runner.js'
import {
  escapeHtml,
  MAX_WORKSPACE_REQUEST_BYTES,
  readJsonBody,
  sendJson,
} from '../server/request-helpers.js'

function parseCodeRunRequest(value: unknown): CodeRunRequest {
  if (value === null || typeof value !== 'object') {
    throw new Error('Workspace run request must be a JSON object.')
  }

  const record = value as Record<string, unknown>
  const languageId = record['languageId']
  const code = record['code']
  const timeoutMs = record['timeoutMs']
  const maxOutputBytes = record['maxOutputBytes']

  if (typeof languageId !== 'string' || languageId.trim().length === 0) {
    throw new Error('Workspace run request requires languageId.')
  }

  if (typeof code !== 'string') {
    throw new Error('Workspace run request requires code.')
  }

  const runRequest: CodeRunRequest = { languageId, code }

  if (typeof timeoutMs === 'number') {
    runRequest.timeoutMs = timeoutMs
  }

  if (typeof maxOutputBytes === 'number') {
    runRequest.maxOutputBytes = maxOutputBytes
  }

  return runRequest
}

async function handleWorkspaceRun(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  if (request.method !== 'POST') {
    sendJson(response, { ok: false, error: 'Method not allowed. Use POST.' }, 405)
    return
  }

  try {
    const body = await readJsonBody(request, MAX_WORKSPACE_REQUEST_BYTES)
    const runRequest = parseCodeRunRequest(body)
    sendJson(response, await runServerCode(runRequest))
  } catch (error: unknown) {
    sendJson(
      response,
      {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
        errors: [],
      },
      400,
    )
  }
}

async function handleWorkspaceIntelligence(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  if (request.method !== 'POST') {
    sendJson(response, { ok: false, error: 'Method not allowed. Use POST.' }, 405)
    return
  }

  try {
    const body = await readJsonBody(request, MAX_WORKSPACE_REQUEST_BYTES)
    const bridgeRequest = parseWorkspaceCodeIntelligenceRequest(body)
    sendJson(response, createWorkspaceCodeIntelligenceBridgeResponse(bridgeRequest))
  } catch (error: unknown) {
    sendJson(
      response,
      {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      },
      400,
    )
  }
}

async function handleSqlVendorAsset(assetName: string, response: ServerResponse): Promise<void> {
  if (!isSqlBrowserVendorAsset(assetName)) {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
    response.end(`Not found: ${escapeHtml(assetName)}`)
    return
  }

  try {
    const assetPath = join(process.cwd(), 'node_modules', 'sql.js', 'dist', assetName)
    const content = await readFile(assetPath)
    response.writeHead(200, {
      'content-type': assetName.endsWith('.wasm')
        ? 'application/wasm'
        : 'text/javascript; charset=utf-8',
      'cache-control': 'no-store',
    })
    response.end(content)
  } catch (error: unknown) {
    response.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' })
    response.end(
      `Unable to load sql.js vendor asset ${escapeHtml(assetName)}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    )
  }
}

/**
 * Handles the unauthenticated Workspace API surface (moved verbatim from
 * `src/web/server.ts`) if the request matches one of its routes. Returns
 * `true` when handled so the caller can fall through to other route tables
 * otherwise. These routes stay unauthenticated -- they don't touch provider
 * credentials or read outside the sandboxed code-execution path, matching
 * the dashboard's pre-unification behavior.
 */
export async function tryHandleWorkspaceRoute(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
): Promise<boolean> {
  if (req.method === 'GET' && url.pathname === '/api/workspace/languages') {
    sendJson(res, {
      languages: UNIVERSAL_LANGUAGE_REGISTRY,
      runners: CODE_RUNNER_DEFINITIONS,
    })
    return true
  }

  if (url.pathname === '/api/workspace/run') {
    await handleWorkspaceRun(req, res)
    return true
  }

  if (url.pathname === '/api/workspace/intelligence') {
    await handleWorkspaceIntelligence(req, res)
    return true
  }

  if (req.method === 'GET' && url.pathname.startsWith('/vendor/')) {
    await handleSqlVendorAsset(url.pathname.slice('/vendor/'.length), res)
    return true
  }

  return false
}
