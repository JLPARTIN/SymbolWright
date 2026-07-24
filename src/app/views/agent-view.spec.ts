import { describe, expect, it } from 'vitest'

import { renderAgentViewHtml } from './agent-view.js'

describe('renderAgentViewHtml', () => {
  it('keeps mission transcript newlines escaped inside the generated browser script', () => {
    const html = renderAgentViewHtml()

    expect(html).toContain(".filter(Boolean).join('\\n');")
    expect(html).not.toContain(".filter(Boolean).join('\n');")
  })
})
