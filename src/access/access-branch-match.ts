/**
 * Minimal glob matcher for branch-scope patterns (`feat/**`, `release/**`, `main`).
 * Supports `*` (single path segment) and `**` (any number of segments, including zero).
 */
export function matchesBranchPattern(branch: string, pattern: string): boolean {
  const branchSegments = branch.split('/').filter((segment) => segment.length > 0)
  const patternSegments = pattern.split('/').filter((segment) => segment.length > 0)
  return matchSegments(branchSegments, patternSegments)
}

function matchSegments(branch: readonly string[], pattern: readonly string[]): boolean {
  if (pattern.length === 0) return branch.length === 0

  const [head, ...restPattern] = pattern
  if (head === '**') {
    if (restPattern.length === 0) return true
    for (let i = 0; i <= branch.length; i++) {
      if (matchSegments(branch.slice(i), restPattern)) return true
    }
    return false
  }

  if (branch.length === 0) return false
  const [branchHead, ...restBranch] = branch
  if (!matchSegment(branchHead as string, head as string)) return false
  return matchSegments(restBranch, restPattern)
}

function matchSegment(value: string, pattern: string): boolean {
  if (pattern === '*') return true
  if (!pattern.includes('*')) return value === pattern
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')
  return new RegExp(`^${escaped}$`).test(value)
}

export function matchesAnyBranchPattern(
  branch: string,
  patterns: readonly string[],
): string | undefined {
  return patterns.find((pattern) => matchesBranchPattern(branch, pattern))
}

export function matchesAnyRepositoryPattern(
  repository: string,
  patterns: readonly string[],
): boolean {
  return patterns.some((entry) => entry.toLowerCase() === repository.toLowerCase())
}
