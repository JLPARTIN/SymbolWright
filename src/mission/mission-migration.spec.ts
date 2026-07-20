import { describe, expect, it } from 'vitest'

import { migrateMissionRecord } from './mission-migration.js'

const BASE = {
  schemaVersion: 1,
  id: 'mission_11111111-1111-4111-8111-111111111111',
  name: 'Mission',
  objective: 'Migrate',
  status: 'ACTIVE',
  createdAt: '2026-07-20T00:00:00.000Z',
  updatedAt: '2026-07-20T00:00:00.000Z',
  lastOpenedAt: '2026-07-20T00:00:00.000Z',
  repository: { rootPath: '.' },
  agent: { runtimeMode: 'READ_ONLY' },
  workspace: { kind: 'repository' },
  evidence: {},
  references: {},
}

describe('mission migration', () => {
  it('normalizes version 1 defaults from the supported import floor', () => {
    const migrated = migrateMissionRecord(BASE)
    expect(migrated.schemaVersion).toBe(1)
    expect(migrated.revision).toBe(1)
    expect(migrated.workspace.openFiles).toEqual([])
    expect(migrated.references.checkpointLinks).toEqual([])
  })

  it('rejects unsupported future or missing schema versions', () => {
    expect(() => migrateMissionRecord({ ...BASE, schemaVersion: 2 })).toThrow(
      'Unsupported mission schema version',
    )
    expect(() => migrateMissionRecord({ ...BASE, schemaVersion: undefined })).toThrow(
      'Unsupported mission schema version',
    )
  })
})
