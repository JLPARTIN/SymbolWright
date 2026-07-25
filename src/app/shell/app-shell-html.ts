import { buildClientRouterScript } from '../router/client-router.js'
import { buildClientStateScript } from '../state/client-state.js'
import { buildAutonomyViewClientScript, renderAutonomyViewHtml } from '../views/autonomy-view.js'
import {
  buildAgentAccessViewClientScript,
  renderAgentAccessViewHtml,
} from '../views/agent-access-view.js'
import { buildToolsViewClientScript, renderToolsViewHtml } from '../views/tools-view.js'
import {
  buildCheckpointsViewClientScript,
  renderCheckpointsViewHtml,
} from '../views/checkpoints-view.js'
import { buildDashboardClientScript, renderDashboardViewHtml } from '../views/dashboard-view.js'
import { buildMemoryViewClientScript, renderMemoryViewHtml } from '../views/memory-view.js'
import { buildMissionsViewClientScript, renderMissionsViewHtml } from '../views/missions-view.js'
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
  .card { background: var(--panel); border: 1px solid #283759; border-radius: 16px; padding: 16px; margin-bottom: 12px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; margin: 12px 0; }
  table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 13px; }
  th, td { border: 1px solid #2a355f; padding: 6px 8px; text-align: left; vertical-align: top; }
  th { background: #0c1226; color: #dbe6ff; }
  button { border: 0; border-radius: 10px; padding: 8px 14px; margin: 6px 6px 0 0; background: var(--accent); color: white; font-weight: 700; cursor: pointer; }
  button.secondary { background: #232c50; color: #dbe6ff; }
  button.mission-danger { background: #6b2530; }
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
  .mission-layout { display:grid; grid-template-columns:minmax(260px, 360px) minmax(0, 1fr); gap:16px; align-items:start; }
  .mission-sidebar input, .mission-sidebar textarea, .mission-sidebar select, .mission-import { width:100%; background:#080c18; color:var(--ink); border:1px solid #2a355f; border-radius:8px; padding:8px; margin-bottom:8px; }
  .mission-sidebar textarea, .mission-import { min-height:100px; resize:vertical; }
  .mission-list { max-height:60vh; overflow:auto; }
  .mission-list-item { border-top:1px solid #2a355f; padding:10px 0; font-size:13px; }
  .mission-open-btn { width:100%; text-align:left; margin:0 0 6px; }
  .mission-active-header { display:grid; grid-template-columns:repeat(auto-fit,minmax(170px,1fr)); gap:6px 12px; }
  .mission-status { display:inline-block; border-radius:999px; padding:2px 8px; background:#29345b; font-size:11px; font-weight:700; }
  .mission-status.active { background:#143323; color:#8ff0b7; }
  .mission-status.paused { background:#4b3b15; color:#f5d978; }
  .mission-status.completed { background:#173a52; color:#97d5ff; }
  .mission-status.abandoned, .mission-status.failed { background:#52202a; color:#ffaaaa; }
  .mission-warning { border-color:#795f22; background:#2c2513; }
  .mission-summary-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); gap:10px; }
  .mission-timeline-heading { display:flex; align-items:center; gap:10px; flex-wrap:wrap; }
  .mission-timeline-heading h3 { margin-right:auto; }
  .mission-event { border-left:3px solid #4b74ff; padding:8px 12px; margin:8px 0; background:#0c1226; }
  .mission-export-output { max-height:360px; overflow:auto; white-space:pre-wrap; word-break:break-word; background:#080c18; padding:10px; border-radius:8px; }
  .mission-context-header { margin:0 0 12px; padding:10px 12px; border:1px solid #2a355f; border-radius:10px; background:#0c1226; font-size:12px; }
  .autonomy-task-list { list-style:none; padding:0; margin:0; }
  .autonomy-task-list li { display:flex; justify-content:space-between; gap:12px; border-top:1px solid #2a355f; padding:8px 0; }
  .autonomy-task-list li span { color:var(--muted); white-space:nowrap; }
  @media (max-width: 900px) {
    .repo-layout, .mission-layout { grid-template-columns: 1fr; }
    .mission-list { max-height:none; }
  }
  @media (max-width: 760px) {
    .app-shell { flex-direction: column; }
    .app-nav { width: 100%; flex-direction: row; flex-wrap: wrap; border-right: 0; border-bottom: 1px solid #283759; position:sticky; top:0; z-index:10; }
    .app-nav .nav-item { flex:1 1 auto; padding:8px; }
    .app-main { padding:12px; }
    .mission-actions button { width:100%; margin-right:0; }
    .autonomy-task-list li { display:block; }
    .autonomy-task-list li span { display:block; margin-top:4px; }
  }
</style>`

/** The unified SymbolWright application shell. */
export function renderAppShellHtml(): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>SymbolWright</title>
  ${renderWorkspaceStyles()}
  ${renderChatStyles()}
  ${APP_SHELL_STYLES}
</head>
<body>
  <div class="app-shell">
    ${renderNavShellHtml()}
    <main class="app-main" id="app-root">
      ${renderDashboardViewHtml()}
      ${renderMissionsViewHtml()}
      ${renderAutonomyViewHtml()}
      ${renderWorkspaceViewHtml()}
      ${renderRepositoryViewHtml()}
      ${renderAgentViewHtml()}
      ${renderToolsViewHtml()}
      ${renderMemoryViewHtml()}
      ${renderCheckpointsViewHtml()}
      ${renderAgentAccessViewHtml()}
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
    ${buildAgentAccessViewClientScript()}
    ${buildSettingsViewClientScript()}
    ${buildMissionsViewClientScript()}
    ${buildAutonomyViewClientScript()}
    (function () {${buildRepositoryViewClientScript()}})();
    ${buildWorkspaceAgentBridgeScript()}

    renderRoute();
    if (typeof window.symbolWrightReloadActiveMission === 'function') {
      void window.symbolWrightReloadActiveMission();
    }
  </script>
</body>
</html>`
}
