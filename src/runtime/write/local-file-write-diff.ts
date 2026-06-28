export interface LocalFileWriteDiff {
  readonly targetPath: string
  readonly previousContent: string | null
  readonly newContent: string
  readonly isNew: boolean
}

export function buildLocalFileWriteDiff(
  targetPath: string,
  previousContent: string | null,
  newContent: string,
): LocalFileWriteDiff {
  return {
    targetPath,
    previousContent,
    newContent,
    isNew: previousContent === null,
  }
}

export function renderLocalFileWriteDiff(diff: LocalFileWriteDiff): string {
  const lines: string[] = [
    'File diff preview',
    '',
    `Target: ${diff.targetPath}`,
    `Status: ${diff.isNew ? 'NEW FILE' : 'MODIFIED'}`,
  ]

  if (diff.isNew) {
    lines.push('', 'New content:', diff.newContent)
  } else {
    lines.push(
      '',
      'Previous content:',
      diff.previousContent ?? '',
      '',
      'New content:',
      diff.newContent,
    )
  }

  return lines.join('\n')
}
