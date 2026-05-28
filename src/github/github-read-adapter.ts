import type {
  CodemindGithubReadAdapterOptions,
  CodemindGithubReadAdapterResult,
  CodemindGithubReadAdapterTarget,
  CodemindGithubReadClient,
  GithubPullRequestApiPayload,
  GithubPullRequestFileApiPayload,
} from './github-read-adapter.types.js';
import type {
  CodemindChangedFileContext,
  CodemindRepoFileChangeType,
} from '../repo-context/repo-context.types.js';

function normalizePath(path: string): string {
  return path.replaceAll('\\', '/').trim();
}

function mapGithubFileStatus(status: string): CodemindRepoFileChangeType {
  switch (status) {
    case 'added':
      return 'ADDED';
    case 'modified':
      return 'MODIFIED';
    case 'renamed':
      return 'RENAMED';
    case 'removed':
      return 'DELETED';
    case 'copied':
      return 'COPIED';
    default:
      return 'UNKNOWN';
  }
}

function isProtectedPath(path: string): boolean {
  const normalized = normalizePath(path);
  return (
    normalized.startsWith('.github/workflows/') ||
    normalized === '.env' ||
    normalized.endsWith('/.env') ||
    normalized.includes('codemind.policy')
  );
}

function mapChangedFile(
  file: GithubPullRequestFileApiPayload,
): CodemindChangedFileContext {
  const path = normalizePath(file.filename);
  const totalDelta = file.additions + file.deletions;
  const protectedPath = isProtectedPath(path);
  const changedFile: CodemindChangedFileContext = {
    path,
    changeType: mapGithubFileStatus(file.status),
    additions: file.additions,
    deletions: file.deletions,
    impactLevel: protectedPath
      ? 'HIGH'
      : totalDelta > 250
        ? 'HIGH'
        : totalDelta > 75
          ? 'MEDIUM'
          : 'LOW',
    protectedPath,
    notes: file.patch ? ['Patch summary available.'] : [],
  };

  if (file.previous_filename) {
    return {
      ...changedFile,
      previousPath: normalizePath(file.previous_filename),
    };
  }

  return changedFile;
}

export function createGithubReadClient(
  options: CodemindGithubReadAdapterOptions,
): CodemindGithubReadClient {
  return {
    async getJson<T>(path: string): Promise<T> {
      const headers: Record<string, string> = {
        Accept: 'application/vnd.github+json',
      };

      if (options.token) {
        headers.Authorization = `Bearer ${options.token}`;
      }

      const response = await fetch(`${options.apiBaseUrl}${path}`, {
        headers,
      });

      if (!response.ok) {
        throw new Error(`GitHub read request failed with status ${response.status}`);
      }

      return (await response.json()) as T;
    },
  };
}

export async function readGithubPullRequestContext(
  client: CodemindGithubReadClient,
  target: CodemindGithubReadAdapterTarget,
): Promise<CodemindGithubReadAdapterResult> {
  const [owner, repo] = target.repositoryFullName.split('/');

  if (!owner || !repo) {
    throw new Error('repositoryFullName must use owner/repo format.');
  }

  const pr = await client.getJson<GithubPullRequestApiPayload>(
    `/repos/${owner}/${repo}/pulls/${target.pullRequestNumber}`,
  );
  const files = await client.getJson<readonly GithubPullRequestFileApiPayload[]>(
    `/repos/${owner}/${repo}/pulls/${target.pullRequestNumber}/files`,
  );

  const changedFiles = files.map((file) => mapChangedFile(file));

  return {
    target,
    context: {
      repository: {
        owner: pr.base.repo.owner.login,
        name: pr.base.repo.name,
        fullName: pr.base.repo.full_name,
        defaultBranch: pr.base.repo.default_branch,
      },
      baseRef: {
        name: pr.base.ref,
        sha: pr.base.sha,
      },
      headRef: {
        name: pr.head.ref,
        sha: pr.head.sha,
      },
      changedFiles,
      diffHunks: [],
      ciEvidence: [],
      testEvidence: [],
      contextGeneratedAt: new Date().toISOString(),
      readOnly: true,
    },
    readOnly: true,
    notes: [
      'GitHub pull request metadata and changed files were mapped into read-only CodeMind repo context.',
    ],
  };
}
