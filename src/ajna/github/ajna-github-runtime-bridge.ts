import { readGithubPullRequestContext } from '../../github/github-read-adapter.js'
import type {
  SymbolWrightGithubReadAdapterResult,
  SymbolWrightGithubReadAdapterTarget,
  SymbolWrightGithubReadClient,
} from '../../github/github-read-adapter.types.js'
import {
  createReadOnlyRuntimeCapabilityFlags,
  evaluateSymbolWrightRuntimeBoundary,
} from '../../runtime/symbolwright-runtime-boundary.js'
import type { SymbolWrightRuntimeBoundaryDecision } from '../../runtime/symbolwright-runtime.types.js'
import type { AjnaReviewRequest, AjnaReviewSubject } from '../ajna-review.types.js'

export interface AjnaGithubRuntimeBridgeInput {
  readonly requestId: string
  readonly sessionId: string
  readonly target: SymbolWrightGithubReadAdapterTarget
  readonly operatorApproved: boolean
  readonly operatorIntent?: string
  readonly requireCiEvidence: boolean
  readonly requireTestEvidence: boolean
}

export interface AjnaGithubRuntimeBridgeResult {
  readonly runtimeDecision: SymbolWrightRuntimeBoundaryDecision
  readonly githubContext: SymbolWrightGithubReadAdapterResult
  readonly ajnaReviewRequest: AjnaReviewRequest
}

export function mapGithubContextToAjnaReviewRequest(
  requestId: string,
  githubContext: SymbolWrightGithubReadAdapterResult,
  options: {
    readonly operatorIntent?: string
    readonly requireCiEvidence: boolean
    readonly requireTestEvidence: boolean
  },
): AjnaReviewRequest {
  const subjectBase = {
    repository: githubContext.context.repository.fullName,
    pullRequestNumber: githubContext.target.pullRequestNumber,
    baseRef: githubContext.context.baseRef.name,
    headRef: githubContext.context.headRef.name,
  } satisfies Omit<AjnaReviewSubject, 'commitSha'>

  const subject: AjnaReviewSubject = githubContext.context.headRef.sha
    ? {
        ...subjectBase,
        commitSha: githubContext.context.headRef.sha,
      }
    : subjectBase

  const reviewRequestBase = {
    requestId,
    subject,
    changedFiles: githubContext.context.changedFiles.map((file) => file.path),
    requireCiEvidence: options.requireCiEvidence,
    requireTestEvidence: options.requireTestEvidence,
  } satisfies Omit<AjnaReviewRequest, 'operatorIntent'>

  if (options.operatorIntent) {
    return {
      ...reviewRequestBase,
      operatorIntent: options.operatorIntent,
    }
  }

  return reviewRequestBase
}

export async function buildAjnaReviewRequestFromGithubPr(
  client: SymbolWrightGithubReadClient,
  input: AjnaGithubRuntimeBridgeInput,
): Promise<AjnaGithubRuntimeBridgeResult> {
  const runtimeDecision = evaluateSymbolWrightRuntimeBoundary({
    adapterId: 'github-pr-read-adapter-v0',
    adapterKind: 'GITHUB_PR_CONTEXT_READER',
    executionMode: 'READ_ONLY',
    capabilityFlags: {
      ...createReadOnlyRuntimeCapabilityFlags(),
      networkRuntimeEnabled: true,
    },
    permissionRequest: {
      requestId: `${input.requestId}:permission`,
      sessionId: input.sessionId,
      mode: 'READ_ONLY',
      toolCategory: 'GITHUB_READER',
      action: 'read GitHub pull request context for Ajna review',
      targets: [
        {
          kind: 'github-resource',
          value: `${input.target.repositoryFullName}/pull/${input.target.pullRequestNumber}`,
        },
      ],
      sourceTrustZone: 'OPERATOR_SESSION',
      operatorApproved: input.operatorApproved,
    },
  })

  if (!runtimeDecision.allowedToRun) {
    throw new Error('GitHub PR read adapter did not pass the SymbolWright runtime boundary.')
  }

  const githubContext = await readGithubPullRequestContext(client, input.target)
  const requestOptionsBase = {
    requireCiEvidence: input.requireCiEvidence,
    requireTestEvidence: input.requireTestEvidence,
  }
  const requestOptions = input.operatorIntent
    ? {
        ...requestOptionsBase,
        operatorIntent: input.operatorIntent,
      }
    : requestOptionsBase
  const ajnaReviewRequest = mapGithubContextToAjnaReviewRequest(
    input.requestId,
    githubContext,
    requestOptions,
  )

  return {
    runtimeDecision,
    githubContext,
    ajnaReviewRequest,
  }
}
