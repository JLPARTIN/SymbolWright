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
import { renderRepositoryPlaceholderViewHtml } from '../views/future-feature-view.js'
import { buildSettingsViewClientScript, renderSettingsViewHtml } from '../views/settings-view.js'
import { renderWorkspaceViewHtml } from '../views/workspace-view.js'
import { buildWorkspaceAgentBridgeScript } from './workspace-agent-bridge.js'

const APP_SHELL_STYLES = `<style>
  :root { color-scheme: dark; --bg:#080c16; --panel:#111a2f; --ink:#e8eefc; --muted:#9da9c2; --accent:#4b74ff; }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--ink); font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
  .app-shell { display: flex; min-height: 100vh; }
  .app-nav { display: flex; flex-direction: column; gap: 4px; width: 200px; flex-shrink: 0; background: var(--panel); border-right: 1px solid #283759; padding: 16px 10px; }
  .app-nav .nav-item { text-align: left; background: transparent; border: 0; border-radius: 10px; padding: 10px 12px; color: var(--muted); font-weight: 600; cursor: pointer; }
  .app-nav .nav-item.active { background: var(--accent); color: white; }
  .app-nav .nav-item-badge { font-size: 10px; text-transform: uppercase; opacity: 0.75; margin-left: 6px; }
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
  .planned-badge { display: inline-block; padding: 4px 10px; border-radius: 8px; background: #3a3350; color: #d7c6ff; font-size: 12px; font-weight: 700; }
  code { color: #dbe6ff; }
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
  ${APP_SHELL_STYLES}
</head>
<body>
  <div class="app-shell">
    ${renderNavShellHtml()}
    <main class="app-main" id="app-root">
      ${renderDashboardViewHtml()}
      ${renderWorkspaceViewHtml()}
      ${renderAgentViewHtml()}
      ${renderToolsViewHtml()}
      ${renderMemoryViewHtml()}
      ${renderCheckpointsViewHtml()}
      ${renderSettingsViewHtml()}
      ${renderRepositoryPlaceholderViewHtml()}
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
    ${buildWorkspaceAgentBridgeScript()}

    renderRoute();
  </script>
</body>
</html>`
}
