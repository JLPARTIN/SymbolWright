export function renderSection(title: string, lines: readonly string[]): string {
  return [title, ...lines.map((line) => `- ${line}`)].join('\n')
}

export function renderNumberedSection(title: string, lines: readonly string[]): string {
  return [title, ...lines.map((line, index) => `${index + 1}. ${line}`)].join('\n')
}

export function renderRuntimeBoundary(): string {
  return renderSection('Boundary:', [
    'no writes',
    'no shell execution',
    'no network',
    'no provider calls',
    'no GitHub writes',
    'no PR comments',
  ])
}
