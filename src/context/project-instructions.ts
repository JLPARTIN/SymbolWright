export const PROJECT_INSTRUCTION_FILES = [
  'README.md',
  'SYMBOLWRIGHT.md',
  // Legacy convention, recognized permanently: a target repository being
  // analyzed may still use its own CODEMIND.md, independent of this repo's
  // own rebrand.
  'CODEMIND.md',
  'CLAUDE.md',
  'AGENTS.md',
  '.github/copilot-instructions.md',
] as const

export type ProjectInstructionFileName = (typeof PROJECT_INSTRUCTION_FILES)[number]

export interface ProjectInstruction {
  readonly fileName: ProjectInstructionFileName | string
  readonly exists: boolean
  readonly contentSummary: string | undefined
  readonly lineCount: number
}

export interface ProjectInstructionSet {
  readonly instructions: readonly ProjectInstruction[]
  readonly foundCount: number
  readonly missingCount: number
}

export function createProjectInstruction(
  fileName: string,
  exists: boolean,
  content: string | undefined,
): ProjectInstruction {
  if (!exists || content === undefined) {
    return { fileName, exists: false, contentSummary: undefined, lineCount: 0 }
  }

  const lines = content.split('\n')
  const firstHeading = lines.find((l) => l.startsWith('#'))
  const summary = firstHeading !== undefined ? firstHeading.replace(/^#+\s*/, '') : (lines[0] ?? '')

  return {
    fileName,
    exists: true,
    contentSummary: summary.slice(0, 120),
    lineCount: lines.length,
  }
}

export function createProjectInstructionSet(
  instructions: readonly ProjectInstruction[],
): ProjectInstructionSet {
  const foundCount = instructions.filter((i) => i.exists).length
  return {
    instructions,
    foundCount,
    missingCount: instructions.length - foundCount,
  }
}

export function renderProjectInstructionSet(set: ProjectInstructionSet): string {
  const lines = [
    'Project Instructions',
    '',
    `Found: ${set.foundCount}`,
    `Missing: ${set.missingCount}`,
    '',
    'Files:',
    ...set.instructions.map((i) => {
      if (!i.exists) {
        return `  ${i.fileName}: NOT FOUND`
      }
      return `  ${i.fileName}: ${i.lineCount} lines — ${i.contentSummary ?? '(empty)'}`
    }),
  ]
  return lines.join('\n')
}
