export type GithubCheckRunStatus = 'queued' | 'in_progress' | 'completed';

export type GithubCheckRunConclusion =
  | 'success'
  | 'failure'
  | 'neutral'
  | 'cancelled'
  | 'skipped'
  | 'timed_out'
  | 'action_required'
  | null;

export interface GithubCheckRun {
  readonly id: number;
  readonly name: string;
  readonly status: GithubCheckRunStatus;
  readonly conclusion: GithubCheckRunConclusion;
  readonly detailsUrl?: string;
}

export interface GithubCheckRunsResponse {
  readonly totalCount: number;
  readonly checkRuns: readonly GithubCheckRun[];
}

export interface GithubChecksSummary {
  readonly total: number;
  readonly completed: number;
  readonly successful: number;
  readonly failed: number;
  readonly neutral: number;
  readonly pending: number;
  readonly runs: readonly GithubCheckRun[];
  readonly readOnly: true;
}

export interface GithubChecksClient {
  readonly getCheckRunsForCommit: (options: {
    readonly repository: string;
    readonly sha: string;
  }) => Promise<GithubCheckRunsResponse>;
}

export class GithubChecksAdapter {
  private readonly client: GithubChecksClient;

  constructor(client: GithubChecksClient) {
    this.client = client;
  }

  async summarizeChecks(
    repository: string,
    sha: string,
  ): Promise<GithubChecksSummary> {
    const response = await this.client.getCheckRunsForCommit({
      repository,
      sha,
    });
    const runs = response.checkRuns;

    let completed = 0;
    let successful = 0;
    let failed = 0;
    let neutral = 0;
    let pending = 0;

    for (const run of runs) {
      if (run.status !== 'completed') {
        pending += 1;
        continue;
      }

      completed += 1;

      if (run.conclusion === 'success') {
        successful += 1;
      } else if (run.conclusion === 'neutral' || run.conclusion === 'skipped') {
        neutral += 1;
      } else if (
        run.conclusion === 'failure' ||
        run.conclusion === 'timed_out' ||
        run.conclusion === 'cancelled' ||
        run.conclusion === 'action_required'
      ) {
        failed += 1;
      }
    }

    return {
      total: runs.length,
      completed,
      successful,
      failed,
      neutral,
      pending,
      runs,
      readOnly: true,
    };
  }
}
