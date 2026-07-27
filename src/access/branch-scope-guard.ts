import { matchesAnyBranchPattern } from './access-branch-match.js'
import type { BranchScope } from './access-types.js'

export interface BranchScopeViolation {
  readonly reasonCode: 'BRANCH_PROTECTED' | 'DEFAULT_BRANCH_PROTECTED' | 'BRANCH_OUT_OF_SCOPE'
  readonly reason: string
}

/**
 * The actual branch-scope decision for a single branch, factored out of
 * `AuthorizationService`'s private `checkBranchScope` so it can be reused wherever a route only
 * learns its real target branch after parsing the request body -- `POST /api/repository/branches`
 * being the motivating case: the grant-token dispatch gate in `symbolwright-chat-server.ts` runs
 * before the body is read, so it can only ever see the *currently checked-out* branch, which is
 * irrelevant to a branch-*creation* request (the branch being created doesn't exist yet, so there
 * is no "current" branch to check -- the requested name is what a `branchScope` restriction must
 * actually gate). Route handlers that know the real target branch call this directly instead of
 * relying on that dispatch-time check.
 */
export function checkBranchScope(
  scope: BranchScope,
  branch: string,
  isDefaultBranch: boolean,
): BranchScopeViolation | undefined {
  if (matchesAnyBranchPattern(branch, scope.deniedPatterns) !== undefined) {
    return {
      reasonCode: 'BRANCH_PROTECTED',
      reason: `Branch "${branch}" is protected and cannot be mutated by this grant.`,
    }
  }
  if (isDefaultBranch && !scope.defaultBranchMutationAllowed) {
    return {
      reasonCode: 'DEFAULT_BRANCH_PROTECTED',
      reason: 'The default branch is read-only for this grant.',
    }
  }
  if (!isDefaultBranch && matchesAnyBranchPattern(branch, scope.allowedPatterns) === undefined) {
    return {
      reasonCode: 'BRANCH_OUT_OF_SCOPE',
      reason: `Branch "${branch}" does not match this grant's allowed branch patterns.`,
    }
  }
  return undefined
}
