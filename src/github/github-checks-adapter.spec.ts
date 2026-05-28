import { describe, expect, it, vi } from 'vitest';

import {
  GithubChecksAdapter,
  type GithubChecksClient,
  type GithubCheckRunsResponse,
} from './github-checks-adapter.js';

describe('GithubChecksAdapter', () => {
  it('summarizes check runs without network access', async () => {
    const fakeResponse: GithubCheckRunsResponse = {
      totalCount: 4,
      checkRuns: [
        {
          id: 1,
          name: 'build',
          status: 'completed',
          conclusion: 'success',
        },
        {
          id: 2,
          name: 'test',
          status: 'completed',
          conclusion: 'failure',
        },
        {
          id: 3,
          name: 'lint',
          status: 'in_progress',
          conclusion: null,
        },
        {
          id: 4,
          name: 'docs',
          status: 'completed',
          conclusion: 'skipped',
        },
      ],
    };
    const client: GithubChecksClient = {
      getCheckRunsForCommit: vi.fn().mockResolvedValue(fakeResponse),
    };

    const adapter = new GithubChecksAdapter(client);
    const summary = await adapter.summarizeChecks('owner/repo', 'abc123');

    expect(client.getCheckRunsForCommit).toHaveBeenCalledWith({
      repository: 'owner/repo',
      sha: 'abc123',
    });
    expect(summary).toEqual({
      total: 4,
      completed: 3,
      successful: 1,
      failed: 1,
      neutral: 1,
      pending: 1,
      runs: fakeResponse.checkRuns,
      readOnly: true,
    });
  });
});
