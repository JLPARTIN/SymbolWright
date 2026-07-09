declare module 'sql.js' {
  export type SqlJsConfig = {
    locateFile?: (file: string) => string
    wasmBinary?: Uint8Array
  }

  export type SqlJsResultSet = {
    columns: string[]
    values: unknown[][]
  }

  export type SqlJsDatabase = {
    exec(sql: string): SqlJsResultSet[]
    close(): void
  }

  export type SqlJsStatic = {
    Database: new () => SqlJsDatabase
  }

  export default function initSqlJs(config?: SqlJsConfig): Promise<SqlJsStatic>
}
