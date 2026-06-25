import type { RuntimeApproval, RuntimePolicySnapshot } from '../types.js'
import { runLocalSelfEditWorkflow, type LocalSelfEditMode } from './local-self-edit-workflow.js'
import {
  executeGitHubPrCreation,
  renderGitHubPrCreationResult,
  type GitHubPrCreationFile,
} from '../github-write/github-pr-creation.js'
import { FakeGitHubPrCreationClient } from '../github-write/fake-github-pr-creation-client.js'
import {
  executePrCollaboration,
  renderPrCollaborationResult,
} from '../github-write/pr-collaboration.js'
import { FakePrCollaborationClient } from '../github-write/fake-pr-collaboration-client.js'

export type ZflowMode = 'preview-only' | 'local-apply' | 'local-apply-and-validate' | 'prepare-pr'

export interface ZflowRequest {
  readonly name: string
  readonly mode: ZflowMode
  readonly reason: string
  readonly rollbackNote: string
  readonly files: readonly GitHubPrCreationFile[]
  readonly repository: string
  readonly baseBranch: string
  readonly headBranch: string
  readonly title: string
  readonly body: string
  readonly validationCommand?: string
  readonly policy?: RuntimePolicySnapshot
  readonly approval?: RuntimeApproval
}

export interface ZflowResult {
  readonly mode: ZflowMode
  readonly localOutput: string
  readonly prOutput: string | null
  readonly collaborationOutput: string | null
}

function toLocalMode(mode: ZflowMode): LocalSelfEditMode {
  if (mode === 'preview-only' || mode === 'prepare-pr') {
    return 'preview-only'
  }

  if (mode === 'local-apply-and-validate') {
    return 'apply-and-validate'
  }

  return 'apply-only'
}

export async function runZflowWorkflow(
  request: ZflowRequest,
  cwd: string = process.cwd(),
): Promise<ZflowResult> {
  const local = await runLocalSelfEditWorkflow(
    {
      name: request.name,
      mode: toLocalMode(request.mode),
      reason: request.reason,
      rollbackNote: request.rollbackNote,
      files: request.files.map((file) => ({
        targetPath: file.path,
        content: file.content,
      })),
      ...(request.validationCommand !== undefined ? { validationCommand: request.validationCommand } : {}),
      ...(request.policy !== undefined ? { policy: request.policy } : {}),
      ...(request.approval !== undefined ? { approval: request.approval } : {}),
    },
    cwd,
  )

  if (request.mode !== 'prepare-pr') {
    return {
      mode: request.mode,
      localOutput: local.workflow.status,
      prOutput: null,
      collaborationOutput: null,
    }
  }

  const prClient = new FakeGitHubPrCreationClient()
  const prResult = await executeGitHubPrCreation(
    {
      repository: request.repository,
      baseBranch: request.baseBranch,
      headBranch: request.headBranch,
      title: request.title,
      body: request.body,
      files: request.files,
      reason: request.reason,
      dryRun: true,
    },
    request.policy ?? local.workflow.policy,
    request.approval,
    prClient,
  )

  const collabClient = new FakePrCollaborationClient()
  const collabResult = await executePrCollaboration(
    {
      action: 'apply_label',
      repository: request.repository,
      prNumber: 1,
      content: 'prepared',
      reason: request.reason,
      dryRun: true,
    },
    request.policy ?? local.workflow.policy,
    request.approval,
    collabClient,
  )

  return {
    mode: request.mode,
    localOutput: local.workflow.status,
    prOutput: renderGitHubPrCreationResult(prResult),
    collaborationOutput: renderPrCollaborationResult(collabResult),
  }
}

export function renderZflowResult(result: ZflowResult): string {
  return [
    'CodeMind zflow workflow',
    '',
    `Mode: ${result.mode}`,
    `Local result: ${result.localOutput}`,
    '',
    result.prOutput ?? 'PR output: not requested',
    '',
    result.collaborationOutput ?? 'Collaboration output: not requested',
    '',
    'Boundary:',
    '- composes existing approved seams',
    '- no live GitHub mutation by default',
    '- no merge actions',
  ].join('\n')
}
