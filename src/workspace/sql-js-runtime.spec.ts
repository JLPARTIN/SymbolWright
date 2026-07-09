import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

import { describe, expect, it } from 'vitest'

import type { SqlJsStatic } from 'sql.js'

const require = createRequire(import.meta.url)

async function loadSqlJsRuntime(): Promise<SqlJsStatic> {
  const sqlJsEntry = require.resolve('sql.js')
  const wasmBinary = readFileSync(join(dirname(sqlJsEntry), 'sql-wasm.wasm'))
  const { default: initSqlJs } = await import('sql.js')

  return initSqlJs({ wasmBinary })
}

describe('real sql.js runtime smoke tests', () => {
  it('executes SQL against an in-memory SQLite database', async () => {
    const runtime = await loadSqlJsRuntime()
    const db = new runtime.Database()

    try {
      const result = db.exec(`
        CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT, active INTEGER);
        INSERT INTO users (name, active) VALUES ('Ada', 1), ('Linus', 0), ('Grace', 1);
        SELECT name FROM users WHERE active = 1 ORDER BY name;
      `)

      expect(result).toHaveLength(1)
      expect(result[0]?.columns).toEqual(['name'])
      expect(result[0]?.values).toEqual([['Ada'], ['Grace']])
    } finally {
      db.close()
    }
  })

  it('raises a real sql.js error for invalid SQL', async () => {
    const runtime = await loadSqlJsRuntime()
    const db = new runtime.Database()

    try {
      expect(() => db.exec('SELECT FROM broken')).toThrow()
    } finally {
      db.close()
    }
  })
})
