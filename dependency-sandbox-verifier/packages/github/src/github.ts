import { Webhooks } from '@octokit/webhooks';
import { Octokit } from '@octokit/rest';

export interface GitHubService {
  createComment(repo: string, issueNumber: number, body: string): Promise<void>;
  getPRDiff(repo: string, prNumber: number): Promise<string>;
}

function splitRepo(repo: string): { owner: string; name: string } {
  const parts = repo.split('/');
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error(`Invalid repo format "${repo}": expected "owner/name"`);
  }
  return { owner: parts[0], name: parts[1] };
}

export class GitHubAppService implements GitHubService {
  // Lazy: Octokit is not instantiated until the first API call so that
  // a missing GITHUB_TOKEN fails at call time with a clear message.
  private _octokit: Octokit | null = null;

  private get octokit(): Octokit {
    if (!this._octokit) {
      const token = process.env.GITHUB_TOKEN;
      if (!token) {
        throw new Error('GITHUB_TOKEN environment variable is required for GitHub API calls');
      }
      this._octokit = new Octokit({ auth: token });
    }
    return this._octokit;
  }

  async createComment(repo: string, issueNumber: number, body: string): Promise<void> {
    const { owner, name } = splitRepo(repo);
    await this.octokit.issues.createComment({
      owner,
      repo: name,
      issue_number: issueNumber,
      body,
    });
  }

  async getPRDiff(repo: string, prNumber: number): Promise<string> {
    const { owner, name } = splitRepo(repo);
    const response = await this.octokit.pulls.get({
      owner,
      repo: name,
      pull_number: prNumber,
      mediaType: { format: 'diff' },
    });
    return response.data as unknown as string;
  }
}

export function createWebhookHandler(onPREvent: (payload: unknown) => void): Webhooks {
  const secret = process.env.WEBHOOK_SECRET;
  if (!secret) {
    throw new Error('WEBHOOK_SECRET environment variable is required to create a webhook handler');
  }

  const webhooks = new Webhooks({ secret });

  webhooks.on('pull_request.opened', ({ payload }) => { onPREvent(payload); });
  webhooks.on('pull_request.synchronize', ({ payload }) => { onPREvent(payload); });
  webhooks.on('pull_request.reopened', ({ payload }) => { onPREvent(payload); });

  return webhooks;
}
