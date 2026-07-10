/**
 * Pure, dependency-free logic shared by the Universal Workspace browser
 * client. These functions take every input as a parameter (no closures
 * over module-level state) so they can both run under Vitest here and be
 * inlined into the browser via `fn.toString()` from
 * `workspace-client-script.ts` — one source of truth, two runtimes.
 */

export interface WorkspaceLanguageLike {
  readonly id: string
  readonly extensions: readonly string[]
}

export function slugifyWorkspaceName(value: string): string {
  const slug = String(value)
    .toLowerCase()
    .replace(/[^a-z0-9_.-]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug || 'codemind-workspace'
}

export function safeWorkspaceProjectPath(path: string): string {
  const value = String(path || '')
    .trim()
    .replaceAll('\\', '/')
    .replace(/^\/+/, '')
  if (!value || value.includes('..') || value.includes('\\')) {
    throw new Error('Unsafe project bundle file path: ' + path)
  }
  return value
}

export function detectWorkspaceLanguageIdByProjectPath(
  path: string,
  languages: readonly WorkspaceLanguageLike[],
): string {
  const normalized = String(path).toLowerCase()
  const fileName = normalized.split('/').pop() || normalized
  const match = languages.find((language) =>
    language.extensions.some((extension) => {
      const ext = String(extension).toLowerCase()
      return ext.startsWith('.')
        ? fileName.endsWith(ext)
        : fileName === ext || normalized.endsWith('/' + ext)
    }),
  )
  return match ? match.id : 'markdown'
}
