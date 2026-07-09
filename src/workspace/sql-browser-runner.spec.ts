import { describe, expect, it } from 'vitest'

import {
  SQL_BROWSER_RUNNER_ID,
  SQL_BROWSER_RUNNER_LIMITS,
  SQL_BROWSER_RUNNER_SAFETY,
  SQL_BROWSER_STARTER_SNIPPET,
  buildSqlJsWorkerSource,
  createSqlResultSummary,
  isSqlBrowserVendorAsset,
} from './sql-browser-runner.js'

describe('sql.js browser runner contract', () => {
  it('declares a real browser sql.js runner id and starter schema', () => {
    expect(SQL_BROWSER_RUNNER_ID).toBe('browser-sqljs')
    expect(SQL_BROWSER_STARTER_SNIPPET).toContain('CREATE TABLE users')
    expect(SQL_BROWSER_STARTER_SNIPPET).toContain('SELECT id, name')
    expect(SQL_BROWSER_RUNNER_SAFETY.join('\n')).toContain('sql.js')
  })

  it('allowlists only the sql.js browser vendor assets that the web server may serve', () => {
    expect(isSqlBrowserVendorAsset('sql-wasm.js')).toBe(true)
    expect(isSqlBrowserVendorAsset('sql-wasm.wasm')).toBe(true)
    expect(isSqlBrowserVendorAsset('../package.json')).toBe(false)
    expect(isSqlBrowserVendorAsset('sql-wasm.debug.js')).toBe(false)
  })

  it('builds a worker source that loads sql.js from served vendor assets', () => {
    const source = buildSqlJsWorkerSource()

    expect(source).toContain("importScripts('/vendor/sql-wasm.js')")
    expect(source).toContain("locateFile: (file) => '/vendor/' + file")
    expect(source).toContain('new runtime.Database()')
    expect(source).toContain('db.exec(code)')
    expect(source).toContain('maxRowsPerResultSet')
    expect(source).toContain(String(SQL_BROWSER_RUNNER_LIMITS.timeoutMs))
  })

  it('summarizes SQL result sets for the workspace output panel', () => {
    expect(createSqlResultSummary({ resultSets: [] })).toBe('No result sets returned.')
    expect(
      createSqlResultSummary({
        resultSets: [{ columns: ['id', 'name'], values: [[1, 'Ada']], truncatedRows: false }],
      }),
    ).toBe('Result set 1: 1 row(s), 2 column(s)')
    expect(
      createSqlResultSummary({
        resultSets: [{ columns: ['id'], values: [[1]], truncatedRows: true }],
      }),
    ).toBe('Result set 1: 1 row(s), 1 column(s) (truncated)')
  })
})
