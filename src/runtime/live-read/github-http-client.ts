export interface GitHubHttpResponse {
  readonly status: number
  readonly body: unknown
}

export interface GitHubHttpClient {
  get(path: string): Promise<GitHubHttpResponse>
}

export interface GitHubHttpClientOptions {
  readonly baseUrl?: string
  readonly token: string
}

const GITHUB_API_BASE = 'https://api.github.com'

export class DefaultGitHubHttpClient implements GitHubHttpClient {
  private readonly baseUrl: string
  private readonly token: string

  constructor(options: GitHubHttpClientOptions) {
    this.baseUrl = options.baseUrl ?? GITHUB_API_BASE
    this.token = options.token
  }

  async get(path: string): Promise<GitHubHttpResponse> {
    const url = `${this.baseUrl}${path}`
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/vnd.github.v3+json',
        Authorization: `Bearer ${this.token}`,
        'User-Agent': 'CodeMind/0.1.0',
      },
    })

    const body: unknown = await response.json()

    return {
      status: response.status,
      body,
    }
  }
}
