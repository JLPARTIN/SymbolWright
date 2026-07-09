export const SQL_BROWSER_RUNNER_ID = 'browser-sqljs' as const

export const SQL_BROWSER_VENDOR_ASSETS = ['sql-wasm.js', 'sql-wasm.wasm'] as const
export type SqlBrowserVendorAsset = (typeof SQL_BROWSER_VENDOR_ASSETS)[number]

export type SqlBrowserResultSet = {
  columns: string[]
  values: unknown[][]
  truncatedRows: boolean
}

export type SqlBrowserRunResult = {
  ok: boolean
  status: 'success' | 'syntax-error' | 'runtime-error' | 'timeout'
  output: string
  errors: string[]
  resultSets: SqlBrowserResultSet[]
  durationMs: number
}

export const SQL_BROWSER_RUNNER_LIMITS = {
  timeoutMs: 2_000,
  maxSqlChars: 32_000,
  maxRowsPerResultSet: 200,
  maxCellChars: 500,
} as const

export const SQL_BROWSER_STARTER_SNIPPET = `CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  active INTEGER NOT NULL
);

INSERT INTO users (name, active) VALUES
  ('Ada', 1),
  ('Grace', 1),
  ('Linus', 0);

SELECT id, name
FROM users
WHERE active = 1
ORDER BY name;`

export const SQL_BROWSER_RUNNER_SAFETY = [
  'Runs through sql.js in a browser Worker using WebAssembly.',
  'Creates an in-memory SQLite database per run; no persistent filesystem is exposed.',
  'The Worker is terminated if it exceeds the configured timeout.',
  'Result rows and cell sizes are capped before rendering.',
] as const

export function isSqlBrowserVendorAsset(value: string): value is SqlBrowserVendorAsset {
  return SQL_BROWSER_VENDOR_ASSETS.some((asset) => asset === value)
}

export function buildSqlJsWorkerSource(): string {
  const limitsJson = JSON.stringify(SQL_BROWSER_RUNNER_LIMITS)

  return `
let SQL = null;
const LIMITS = ${limitsJson};

function formatCell(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' && value.length > LIMITS.maxCellChars) {
    return value.slice(0, LIMITS.maxCellChars) + '[truncated]';
  }
  return value;
}

async function loadSqlJs() {
  if (SQL !== null) return SQL;
  importScripts('/vendor/sql-wasm.js');
  SQL = await initSqlJs({ locateFile: (file) => '/vendor/' + file });
  return SQL;
}

self.onmessage = async (event) => {
  const startedAt = Date.now();
  const code = event.data && typeof event.data.code === 'string' ? event.data.code : '';

  if (code.trim().length === 0) {
    self.postMessage({ ok: false, status: 'syntax-error', output: '', errors: ['SQL input is empty.'], resultSets: [], durationMs: Date.now() - startedAt });
    return;
  }

  if (code.length > LIMITS.maxSqlChars) {
    self.postMessage({ ok: false, status: 'runtime-error', output: '', errors: ['SQL input exceeds ' + LIMITS.maxSqlChars + ' characters.'], resultSets: [], durationMs: Date.now() - startedAt });
    return;
  }

  try {
    const runtime = await loadSqlJs();
    const db = new runtime.Database();
    const rawResults = db.exec(code);
    const resultSets = rawResults.map((set) => {
      const values = set.values.slice(0, LIMITS.maxRowsPerResultSet).map((row) => row.map(formatCell));
      return {
        columns: set.columns,
        values,
        truncatedRows: set.values.length > LIMITS.maxRowsPerResultSet,
      };
    });
    db.close();
    const output = resultSets.length === 0
      ? 'SQL executed successfully. No result sets returned.'
      : 'SQL executed successfully. Result sets: ' + resultSets.length;
    self.postMessage({ ok: true, status: 'success', output, errors: [], resultSets, durationMs: Date.now() - startedAt });
  } catch (error) {
    const message = error && error.message ? error.message : String(error);
    self.postMessage({ ok: false, status: 'runtime-error', output: '', errors: [message], resultSets: [], durationMs: Date.now() - startedAt });
  }
};
`
}

export function createSqlResultSummary(result: Pick<SqlBrowserRunResult, 'resultSets'>): string {
  if (result.resultSets.length === 0) {
    return 'No result sets returned.'
  }

  return result.resultSets
    .map(
      (set, index) =>
        `Result set ${index + 1}: ${set.values.length} row(s), ${set.columns.length} column(s)${
          set.truncatedRows ? ' (truncated)' : ''
        }`,
    )
    .join('\n')
}
