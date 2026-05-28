export interface GithubCommentClient {
  readonly postPullRequestComment: (options: {
    readonly repository: string;
    readonly pullRequestNumber: number;
    readonly body: string;
  }) => Promise<void>;
}

export interface GithubCommentAdapterOptions {
  readonly enabled: boolean;
}

export interface GithubCommentRequest {
  readonly repository: string;
  readonly pullRequestNumber: number;
  readonly markdownReview: string;
}

export interface GithubCommentResult {
  readonly attempted: boolean;
  readonly posted: boolean;
  readonly dryRun: boolean;
  readonly reason: string;
}

export class GithubCommentAdapter {
  private readonly client: GithubCommentClient;
  private readonly options: GithubCommentAdapterOptions;

  constructor(client: GithubCommentClient, options: GithubCommentAdapterOptions) {
    this.client = client;
    this.options = options;
  }

  isEnabled(): boolean {
    return this.options.enabled;
  }

  async postReviewComment(
    request: GithubCommentRequest,
  ): Promise<GithubCommentResult> {
    if (!this.isEnabled()) {
      return {
        attempted: true,
        posted: false,
        dryRun: true,
        reason: 'GitHub comment adapter is disabled; no comment was posted.',
      };
    }

    await this.client.postPullRequestComment({
      repository: request.repository,
      pullRequestNumber: request.pullRequestNumber,
      body: request.markdownReview,
    });

    return {
      attempted: true,
      posted: true,
      dryRun: false,
      reason: 'GitHub comment was posted through an explicitly enabled adapter.',
    };
  }
}
