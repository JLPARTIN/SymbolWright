import { buildClientRouterScript } from '../router/client-router.js'
import { buildClientStateScript } from '../state/client-state.js'
import { buildToolsViewClientScript, renderToolsViewHtml } from '../views/tools-view.js'
import {
  buildCheckpointsViewClientScript,
  renderCheckpointsViewHtml,
} from '../views/checkpoints-view.js'
import { buildDashboardClientScript, renderDashboardViewHtml } from '../views/dashboard-view.js'
import { buildMemoryViewClientScript, renderMemoryViewHtml } from '../views/memory-view.js'
import { renderAgentViewHtml } from '../views/agent-view.js'
import { renderNavShellHtml } from '../views/nav-shell-view.js'
import {
  buildRepositoryViewClientScript,
  renderRepositoryViewHtml,
} from '../views/repository-view.js'
import { buildSettingsViewClientScript, renderSettingsViewHtml } from '../views/settings-view.js'
import { renderWorkspaceViewHtml } from '../views/workspace-view.js'
import { renderWorkspaceStyles } from '../../workspace/universal-editor-html.js'
import { renderChatStyles } from '../../server/chat-ui-html.js'
import { buildWorkspaceAgentBridgeScript } from './workspace-agent-bridge.js'

const APP_SHELL_STYLES = `<style>
  :root { color-scheme: dark; --bg:#080c16; --panel:#111a2f; --ink:#e8eefc; --muted:#9da9c2; --accent:#4b74ff; }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--ink); font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
  .app-shell { display: flex; min-height: 100vh; }
  .app-nav { display: flex; flex-direction: column; gap: 4px; width: 200px; flex-shrink: 0; background: var(--panel); border-right: 1px solid #283759; padding: 16px 10px; }
  .app-nav .nav-item { text-align: left; background: transparent; border: 0; border-radius: 10px; padding: 10px 12px; color: var(--muted); font-weight: 600; cursor: pointer; }
  .app-nav .nav-item.active { background: var(--accent); color: white; }
  .app-main { flex: 1; min-width: 0; padding: 20px; }
  .app-view { max-width: 1280px; margin: 0 auto; }
  .muted { color: var(--muted); }
  .card { background: var(--panel); border: 1px solid #283759; border-radius: 16px; padding: 16px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; margin: 12px 0; }
  table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 13px; }
  th, td { border: 1px solid #2a355f; padding: 6px 8px; text-align: left; vertical-align: top; }
  th { background: #0c1226; color: #dbe6ff; }
  button { border: 0; border-radius: 10px; padding: 8px 14px; margin: 6px 6px 0 0; background: var(--accent); color: white; font-weight: 700; cursor: pointer; }
  button.secondary { background: #232c50; color: #dbe6ff; }
  input, textarea, select { font-family: inherit; }
  .tool-mode-badge { display: inline-block; padding: 2px 6px; border-radius: 6px; background: #232c50; color: #8ea0d7; font-size: 11px; margin-right: 4px; }
  .tool-mode-badge.ok { background: #143323; color: #8ff0b7; }
  code { color: #dbe6ff; }
  .repo-layout { display: grid; grid-template-columns: minmax(180px, 220px) minmax(0, 1.4fr) minmax(220px, 0.9fr); gap: 12px; align-items: start; }
  .repo-branch-row { display: flex; gap: 6px; align-items: center; margin-bottom: 10px; flex-wrap: wrap; }
  .repo-tree { max-height: 60vh; overflow-y: auto; }
  .repo-tree-list { list-style: none; margin: 0; padding-left: 12px; }
  .repo-tree-panel > .repo-tree > .repo-tree-list { padding-left: 0; }
  .repo-tree-entry { display: block; width: 100%; text-align: left; background: transparent; color: var(--ink); border-radius: 6px; padding: 3px 6px; margin: 0; font-weight: 400; }
  .repo-tree-entry.file { color: #cdd7ff; }
  .repo-editor-panel .repo-editor { width: 100%; min-height: 420px; box-sizing: border-box; background: #080c18; color: var(--ink); border: 1px solid #2a355f; border-radius: 10px; padding: 10px; font: 13px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; }
  .repo-changes-panel input, .repo-changes-panel textarea { width: 100%; box-sizing: border-box; background: #080c18; color: var(--ink); border: 1px solid #2a355f; border-radius: 8px; padding: 8px; margin-bottom: 6px; }
  .repo-change-list { list-style: none; margin: 4px 0 10px; padding: 0; }
  .repo-change-entry { display: block; width: 100%; text-align: left; background: #0c1226; color: #cdd7ff; font-weight: 400; margin: 2px 0; }
  .repo-diff { background: #080c18; border: 1px solid #2a355f; border-radius: 10px; padding: 10px; max-height: 260px; overflow: auto; white-space: pre-wrap; font-size: 12px; }
  .repo-changes-panel .row { display: flex; gap: 8px; }
  .repo-changes-panel .row > div { flex: 1; }
  @media (max-width: 900px) {
    .repo-layout { grid-template-columns: 1fr; }
  }
  @media (max-width: 760px) {
    .app-shell { flex-direction: column; }
    .app-nav { width: 100%; flex-direction: row; flex-wrap: wrap; border-right: 0; border-bottom: 1px solid #283759; }
  }
</style>`

/**
 * The unified CodeMind application shell (Large PR Bundle 1). Serves the
 * dashboard, workspace, agent, tools, memory, checkpoints, and settings
 * views as sibling sections in one document, switched by a hash router —
 * one origin, one process, persistent navigation, no separate chat page.
 */
export function renderAppShellHtml(): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>CodeMind</title>
  ${renderWorkspaceStyles()}
  ${renderChatStyles()}
  ${APP_SHELL_STYLES}
</head>
<body>
  <div class="app-shell">
    ${renderNavShellHtml()}
    <main class="app-main" id="app-root">
      ${renderDashboardViewHtml()}
      ${renderWorkspaceViewHtml()}
      ${renderRepositoryViewHtml()}
      ${renderAgentViewHtml()}
      ${renderToolsViewHtml()}
      ${renderMemoryViewHtml()}
      ${renderCheckpointsViewHtml()}
      ${renderSettingsViewHtml()}
    </main>
  </div>

  <script>
    ${buildClientStateScript()}
    ${buildClientRouterScript()}
    ${buildDashboardClientScript()}
    ${buildToolsViewClientScript()}
    ${buildMemoryViewClientScript()}
    ${buildCheckpointsViewClientScript()}
    ${buildSettingsViewClientScript()}
    (function () {${buildRepositoryViewClientScript()}})();
    ${buildWorkspaceAgentBridgeScript()}

    renderRoute();
  </script>
</body>
</html>`
}
