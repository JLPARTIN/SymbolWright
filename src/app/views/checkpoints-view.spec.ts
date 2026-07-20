import { describe, expect, it } from 'vitest'

import { buildCheckpointsViewClientScript, renderCheckpointsViewHtml } from './checkpoints-view.js'

describe('renderCheckpointsViewHtml', () => {
  it('no longer says restore is CLI-only, now that Bundle 2 gives it a real repository to restore into', () => {
    const html = renderCheckpointsViewHtml()
    expect(html).not.toContain('CLI-only')
  })
})

describe('buildCheckpointsViewClientScript', () => {
  it('requires an explicit window.confirm before restoring a checkpoint', () => {
    const script = buildCheckpointsViewClientScript()
    const fnBody = script.slice(
      script.indexOf('async function restoreCheckpointById'),
      script.indexOf('async function loadCheckpointsView'),
    )
    expect(fnBody).toContain('window.confirm(')
    expect(fnBody.indexOf('window.confirm(')).toBeLessThan(fnBody.indexOf('/restore'))
  })

  it('calls the real restore route added in Large PR Bundle 2', () => {
    const script = buildCheckpointsViewClientScript()
    expect(script).toContain('/api/repository/checkpoints/')
    expect(script).toContain('/restore')
    expect(script).toContain("method: 'POST'")
  })

  it('renders a Restore button per checkpoint row', () => {
    const script = buildCheckpointsViewClientScript()
    expect(script).toContain('data-restore-checkpoint')
  })
})
