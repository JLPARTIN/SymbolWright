import fs from 'node:fs'
import path from 'node:path'

import {
  PROJECT_INSTRUCTION_FILES,
  createProjectInstruction,
  createProjectInstructionSet,
  type ProjectInstruction,
  type ProjectInstructionSet,
} from './project-instructions.js'

const PROTECTED_PATHS = new Set(['.env', '.env.local', 'node_modules', '.git', 'dist', 'coverage'])

const SECRET_PATTERNS = [
  /(?:api[_-]?key|secret|token|password|credential)\s*[:=]\s*\S+/gi,
  /ghp_[A-Za-z0-9]{36}/g,
  /sk-[A-Za-z0-9]{48}/g,
  /-----BEGIN\s+(?:RSA\s+)?PRIVATE\s+KEY-----/g,
]

function isProtectedPath(filePath: string): boolean {
  const segments = filePath.split(path.sep)
  return segments.some((s) => PROTECTED_PATHS.has(s))
}

function redactSecrets(content: string): string {
  let redacted = content
  for (const pattern of SECRET_PATTERNS) {
    redacted = redacted.replace(pattern, '[REDACTED]')
  }
  return redacted
}

export function loadProjectInstruction(rootDir: string, fileName: string): ProjectInstruction {
  if (isProtectedPath(fileName)) {
    return createProjectInstruction(fileName, false, undefined)
  }

  const filePath = path.resolve(rootDir, fileName)

  if (!filePath.startsWith(path.resolve(rootDir))) {
    return createProjectInstruction(fileName, false, undefined)
  }

  try {
    const content = fs.readFileSync(filePath, 'utf8')
    return createProjectInstruction(fileName, true, redactSecrets(content))
  } catch {
    return createProjectInstruction(fileName, false, undefined)
  }
}

export function loadProjectInstructionSet(rootDir: string): ProjectInstructionSet {
  const instructions = PROJECT_INSTRUCTION_FILES.map((f) => loadProjectInstruction(rootDir, f))
  return createProjectInstructionSet(instructions)
}
