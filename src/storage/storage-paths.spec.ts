import { describe, expect, it } from 'vitest'

import {
  resolveStoragePaths,
  sessionFilePath,
  auditFilePath,
} from './storage-paths.js'

describe('resolveStoragePaths', () => {
  it('resolves global and workspace paths', () => {
    const paths = resolveStoragePaths('/home/user/project')

    expect(paths.globalRoot).toContain('.codemind')
    expect(paths.sessionsDir).toContain('sessions')
    expect(paths.auditDir).toContain('audit')
    expect(paths.workspaceRoot).toBe('/home/user/project/.codemind')
    expect(paths.workspaceSessionsDir).toContain('sessions')
    expect(paths.workspaceAuditDir).toContain('audit')
  })
})

describe('sessionFilePath', () => {
  it('returns path with .jsonl extension', () => {
    const path = sessionFilePath('/dir/sessions', 'session-123')
    expect(path).toContain('session-123.jsonl')
  })
})

describe('auditFilePath', () => {
  it('returns path with .audit.jsonl extension', () => {
    const path = auditFilePath('/dir/audit', 'session-123')
    expect(path).toContain('session-123.audit.jsonl')
  })
})
