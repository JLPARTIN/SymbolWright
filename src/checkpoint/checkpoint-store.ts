import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
  unlinkSync,
} from 'node:fs'
import path from 'node:path'

import type { CheckpointMetadata } from './checkpoint-types.js'

export function resolveCheckpointsRoot(workspaceRoot: string): string {
  return path.join(workspaceRoot, '.symbolwright', 'checkpoints')
}

export function resolveSessionDir(workspaceRoot: string, sessionId: string): string {
  return path.join(resolveCheckpointsRoot(workspaceRoot), sessionId)
}

export function resolveCheckpointDir(
  workspaceRoot: string,
  sessionId: string,
  checkpointId: string,
): string {
  return path.join(resolveSessionDir(workspaceRoot, sessionId), checkpointId)
}

function isDirectory(entryPath: string): boolean {
  try {
    return statSync(entryPath).isDirectory()
  } catch {
    return false
  }
}

export function writeCheckpointMetadata(checkpointDir: string, metadata: CheckpointMetadata): void {
  mkdirSync(checkpointDir, { recursive: true })
  writeFileSync(
    path.join(checkpointDir, 'checkpoint.json'),
    JSON.stringify(metadata, null, 2),
    'utf-8',
  )
}

export function readCheckpointMetadata(checkpointDir: string): CheckpointMetadata | undefined {
  const file = path.join(checkpointDir, 'checkpoint.json')
  if (!existsSync(file)) return undefined

  try {
    return JSON.parse(readFileSync(file, 'utf-8')) as CheckpointMetadata
  } catch {
    return undefined
  }
}

/** Writes a file snapshot under `<checkpointDir>/files/<relativeSnapshotPath>`, mirroring directory structure. */
export function writeSnapshotFile(
  checkpointDir: string,
  relativeSnapshotPath: string,
  content: string,
): void {
  const target = path.join(checkpointDir, 'files', relativeSnapshotPath)
  mkdirSync(path.dirname(target), { recursive: true })
  writeFileSync(target, content, 'utf-8')
}

export function readSnapshotFile(checkpointDir: string, relativeSnapshotPath: string): string {
  return readFileSync(path.join(checkpointDir, 'files', relativeSnapshotPath), 'utf-8')
}

export function deleteFileIfExists(resolvedPath: string): void {
  if (existsSync(resolvedPath)) {
    unlinkSync(resolvedPath)
  }
}

export function listSessionIds(workspaceRoot: string): readonly string[] {
  const root = resolveCheckpointsRoot(workspaceRoot)
  if (!existsSync(root)) return []
  return readdirSync(root).filter((name) => isDirectory(path.join(root, name)))
}

export function listCheckpointIdsForSession(
  workspaceRoot: string,
  sessionId: string,
): readonly string[] {
  const dir = resolveSessionDir(workspaceRoot, sessionId)
  if (!existsSync(dir)) return []
  return readdirSync(dir).filter((name) => isDirectory(path.join(dir, name)))
}

/** Locates a checkpoint by id across every session directory — checkpoint ids are unique workspace-wide. */
export function findCheckpointDirById(
  workspaceRoot: string,
  checkpointId: string,
): { readonly sessionId: string; readonly checkpointDir: string } | undefined {
  for (const sessionId of listSessionIds(workspaceRoot)) {
    const checkpointDir = resolveCheckpointDir(workspaceRoot, sessionId, checkpointId)
    if (existsSync(path.join(checkpointDir, 'checkpoint.json'))) {
      return { sessionId, checkpointDir }
    }
  }
  return undefined
}
