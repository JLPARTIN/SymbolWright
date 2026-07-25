import { join } from 'node:path'
import { homedir } from 'node:os'

export const STATE_DIR_NAME = '.symbolwright'
export const LEGACY_STATE_DIR_NAME = '.codemind'

export interface StoragePaths {
  readonly globalRoot: string
  readonly sessionsDir: string
  readonly auditDir: string
  readonly workspaceRoot: string
  readonly workspaceSessionsDir: string
  readonly workspaceAuditDir: string
}

export function resolveStoragePaths(workspaceCwd: string): StoragePaths {
  const globalRoot = join(homedir(), STATE_DIR_NAME)
  const workspaceRoot = join(workspaceCwd, STATE_DIR_NAME)

  return {
    globalRoot,
    sessionsDir: join(globalRoot, 'sessions'),
    auditDir: join(globalRoot, 'audit'),
    workspaceRoot,
    workspaceSessionsDir: join(workspaceRoot, 'sessions'),
    workspaceAuditDir: join(workspaceRoot, 'audit'),
  }
}

export function sessionFilePath(sessionsDir: string, sessionId: string): string {
  return join(sessionsDir, `${sessionId}.jsonl`)
}

export function auditFilePath(auditDir: string, sessionId: string): string {
  return join(auditDir, `${sessionId}.audit.jsonl`)
}
