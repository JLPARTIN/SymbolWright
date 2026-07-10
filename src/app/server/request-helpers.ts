import { Buffer } from 'node:buffer'
import type { IncomingMessage, ServerResponse } from 'node:http'

export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

export function sendJson(response: ServerResponse, value: unknown, statusCode = 200): void {
  response.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  })
  response.end(JSON.stringify(value, null, 2))
}

export function sendHtmlDocument(response: ServerResponse, html: string, statusCode = 200): void {
  response.writeHead(statusCode, {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-store',
  })
  response.end(html)
}

/** Moved from `src/web/server.ts` (`maxWorkspaceRequestBytes`) — workspace requests are small code snippets, so a tighter cap than the chat/agent body limit is appropriate. */
export const MAX_WORKSPACE_REQUEST_BYTES = 80_000

export async function readJsonBody(request: IncomingMessage, maxBytes: number): Promise<unknown> {
  let body = ''
  let bytes = 0

  for await (const chunk of request) {
    const text = typeof chunk === 'string' ? chunk : chunk.toString('utf8')
    bytes += Buffer.byteLength(text, 'utf8')

    if (bytes > maxBytes) {
      throw new Error(`Request body exceeds ${maxBytes} bytes.`)
    }

    body += text
  }

  if (body.trim().length === 0) {
    return {}
  }

  return JSON.parse(body)
}
