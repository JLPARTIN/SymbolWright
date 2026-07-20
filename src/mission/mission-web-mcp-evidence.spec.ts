import { describe, expect, it } from 'vitest'

import { createMissionEvent } from './mission-events.js'

const ID = 'mission_11111111-1111-4111-8111-111111111111'

describe('mission web and MCP evidence redaction', () => {
  it('masks secret query values and MCP environments', () => {
    const web = createMissionEvent({
      missionId: ID, type: 'web.request.completed', summary: 'Web request complete',
      payload: { url: 'https://example.test/?api_key=secret-value', status: 200 },
    })
    const mcp = createMissionEvent({
      missionId: ID, type: 'mcp.call.completed', summary: 'MCP call complete',
      payload: { serverName: 'local', environment: { API_KEY: 'secret-value' } },
    })
    expect(JSON.stringify([web, mcp])).not.toContain('secret-value')
    expect(web.payload?.['status']).toBe(200)
    expect(mcp.payload?.['serverName']).toBe('local')
  })
})
