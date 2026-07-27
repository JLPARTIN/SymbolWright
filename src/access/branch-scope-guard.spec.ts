import { describe, expect, it } from 'vitest'

import { checkBranchScope } from './branch-scope-guard.js'
import {
  DEFAULT_ALLOWED_BRANCH_PATTERNS,
  DEFAULT_DENIED_BRANCH_PATTERNS,
  type BranchScope,
} from './access-types.js'

const STANDARD_SCOPE: BranchScope = {
  allowedPatterns: DEFAULT_ALLOWED_BRANCH_PATTERNS,
  deniedPatterns: DEFAULT_DENIED_BRANCH_PATTERNS,
  defaultBranchReadOnly: true,
  defaultBranchMutationAllowed: false,
}

describe('checkBranchScope', () => {
  it('allows a branch matching an allowed pattern', () => {
    expect(checkBranchScope(STANDARD_SCOPE, 'feat/my-change', false)).toBeUndefined()
  })

  it('denies a branch matching a denied pattern, even if it would also match an allowed one', () => {
    const scope: BranchScope = {
      ...STANDARD_SCOPE,
      allowedPatterns: [...STANDARD_SCOPE.allowedPatterns, 'release/**'],
    }
    const violation = checkBranchScope(scope, 'release/v2', false)
    expect(violation?.reasonCode).toBe('BRANCH_PROTECTED')
  })

  it('denies a branch matching no allowed pattern', () => {
    const violation = checkBranchScope(STANDARD_SCOPE, 'not-an-allowed-prefix', false)
    expect(violation?.reasonCode).toBe('BRANCH_OUT_OF_SCOPE')
  })

  it('denies mutating the default branch when defaultBranchMutationAllowed is false', () => {
    // Use a default-branch name that isn't itself in `deniedPatterns`, so this isolates the
    // `defaultBranchMutationAllowed` check from the (separate, always-applied) deny-list check.
    const violation = checkBranchScope(STANDARD_SCOPE, 'trunk', true)
    expect(violation?.reasonCode).toBe('DEFAULT_BRANCH_PROTECTED')
  })

  it('allows mutating the default branch when defaultBranchMutationAllowed is true', () => {
    const scope: BranchScope = { ...STANDARD_SCOPE, defaultBranchMutationAllowed: true }
    expect(checkBranchScope(scope, 'trunk', true)).toBeUndefined()
  })

  it('does not require an allowed-pattern match for the default branch', () => {
    const scope: BranchScope = { ...STANDARD_SCOPE, defaultBranchMutationAllowed: true }
    expect(checkBranchScope(scope, 'trunk', true)).toBeUndefined()
  })

  it('a denied pattern always wins, even for the default branch', () => {
    const scope: BranchScope = { ...STANDARD_SCOPE, defaultBranchMutationAllowed: true }
    const violation = checkBranchScope(scope, 'main', true)
    expect(violation?.reasonCode).toBe('BRANCH_PROTECTED')
  })
})
