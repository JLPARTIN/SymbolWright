import { renderChatBodyMarkup, renderChatScripts } from '../../server/chat-ui-html.js'

/**
 * The unified shell's `#/agent` view — the same connect/mode/provider/chat
 * markup and client behavior as the standalone chat server, embedded as a
 * sibling section instead of a separate page/port.
 */
export function renderAgentViewHtml(): string {
  return `<section data-view="agent" class="app-view" style="display:none">
    ${renderChatBodyMarkup()}
  </section>
  ${renderChatScripts()}`
}
