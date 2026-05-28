import { describe, expect, it } from 'vitest';

import {
  assertGithubPrContextIsReadOnly,
  createReadOnlyGithubPrContextResponse,
} from './github-pr-context-contract.js';
import type { CodemindGithubPrContextAdapterRequest } from './github-pr-context.types.js';
import type { CodemindReadOnlyRepoContext } from '../repo-context/repo-context.types.js';

function makeRequest(
  overrides: Partial<CodemindGithubPrContextAdapterRequest> = {},
): CodemindGithubPrContextAdapterRequest {
  return {
    requestId: 'github-pr-context-1',
    adapterMode: 'READ_ONLY_CONTRACT',
    pullRequest: {
      repositoryFullName: 'JLPARTIN/JLPARTIN-CodeMind',
      pullRequestNumber: 7,
      baseRef: 'main',
      headRef: 'pr7-github-pr-context-contracts',
    },
    requestedInputs: ['PULL_REQUEST_METADATA', 'CHANGED_FILES', 'CI_STATUS'],
    includeReviewCommentContext: false,
    includeCiEvidence: true,
    includeTestEvidence: true,
    ...overrides,
  };
}

function makeContext(
  overrides: Partial<CodemindReadOnlyRepoContext> = {},
): CodemindReadOnlyRepoContext {
  return {
    repository: {
      owner: 'JLPARTIN',
      name: 'JLPARTIN-CodeMind',
      fullName: 'JLPARTIN/JLPARTIN-CodeMind',
      defaultBranch: 'main',
    },
    baseRef: { name: 'main' },
    headRef: { name: 'pr7-github-pr-context-contracts' },
    changedFiles: [],
    diffHunks: [],
    ciEvidence: [],
    testEvidence: [],
    contextGeneratedAt: '2026-05-28T00:00:00.000Z',
    readOnly: true,
    ...overrides,
  };
}

describe('GitHub PR context adapter contracts', () => {
  it('creates read-only adapter responses with all write paths disabled', () => {
    const response = createReadOnlyGithubPrContextResponse(
      makeRequest(),
      makeContext(),
    );

    expect(response.readOnly).toBe(true);
    expect(response.githubWriteEnabled).toBe(false);
    expect(response.commentsEnabled).toBe(false);
    expect(response.mergeEnabled).toBe(false);
    expect(response.networkRuntimeImplemented).toBe(false);
    expect(assertGithubPrContextIsReadOnly(response)).toBe(true);
  });

  it('fails read-only assertion if a write path is enabled', () => {
    const response = createReadOnlyGithubPrContextResponse(
      makeRequest(),
      makeContext(),
    );

    expect(
      assertGithubPrContextIsReadOnly({
        ...response,
        githubWriteEnabled: true,
      }),
    ).toBe(false);
  });

  it('preserves pull request identity from the request', () => {
    const request = makeRequest({
      pullRequest: {
        repositoryFullName: 'JLPARTIN/AELIB--X1YA0I',
        pullRequestNumber: 233,
        baseRef: 'main',
        headRef: 'phase-16f-conversation-eval',
        headSha: 'abc123',
      },
    });

    const response = createReadOnlyGithubPrContextResponse(request, makeContext());

    expect(response.pullRequest).toEqual(request.pullRequest);
  });
});
