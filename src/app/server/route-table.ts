import type { IncomingMessage, ServerResponse } from 'node:http'

import { renderAppShellHtml } from '../shell/app-shell-html.js'
import { tryHandleWorkspaceRoute } from '../api/workspace-routes.js'
import { sendHtmlDocument } from './request-helpers.js'

/**
 * The new routes Large PR Bundle 1 adds on top of the existing, already
 * tested chat/provider/agent/readonly-registry dispatch in
 * `symbolwright-chat-server.ts`. Evaluated in order, first match wins; a
 * `false` return means "not one of these, try the next route table."
 *
 * `GET /api/status` is rewritten onto the existing authenticated
 * `/api/local-status` handler rather than duplicated -- both serve the same
 * `collectStatus()` data, and this keeps `/api/status` behind the same
 * auth gate instead of exposing it publicly (the audit's first required
 * correction: the old unauthenticated dashboard's `/api/status` must not
 * carry over unauthenticated once merged with the rest of the app).
 */
export async function tryHandleUnifiedRoute(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
): Promise<boolean> {
  if (req.method === 'GET' && url.pathname === '/') {
    sendHtmlDocument(res, renderAppShellHtml())
    return true
  }

  if (req.method === 'GET' && (url.pathname === '/workspace' || url.pathname === '/workspace/')) {
    res.writeHead(302, { location: '/#/workspace' })
    res.end()
    return true
  }

  if (req.method === 'GET' && url.pathname === '/api/status') {
    req.url = '/api/local-status' + url.search
    return false
  }

  if (await tryHandleWorkspaceRoute(req, res, url)) {
    return true
  }

  return false
}
