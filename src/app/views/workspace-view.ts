import {
  createUniversalWorkspacePayload,
  renderWorkspaceBodyMarkup,
  renderWorkspaceScripts,
} from '../../workspace/universal-editor-html.js'

/**
 * The unified shell's `#/workspace` view — the same Universal Workspace
 * editor markup and client behavior as the standalone `/workspace` route,
 * embedded as a sibling section instead of a separate page. Its "AI task"
 * buttons still work exactly as before at this point; the embedded,
 * in-page handoff to the Agent view (replacing the `<a href>` link) is
 * wired in a later commit alongside the shell boot script that defines
 * `window.symbolWrightHandleWorkspaceDraft`.
 */
export function renderWorkspaceViewHtml(): string {
  const payload = createUniversalWorkspacePayload()

  return `<section data-view="workspace" class="app-view" style="display:none">
    ${renderWorkspaceBodyMarkup()}
  </section>
  ${renderWorkspaceScripts(payload)}`
}
