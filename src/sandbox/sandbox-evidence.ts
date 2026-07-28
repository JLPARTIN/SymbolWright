import { excerptSandboxOutput, sha256Text } from './sandbox-redaction.js'
import type { SandboxBrokerDecision } from './sandbox-execution-broker.js'
import type { SandboxAuthorizationContext } from './sandbox-policy-model.js'
import type {
  SandboxExecutionRequest,
  SandboxExecutionResult,
  SandboxSourceFile,
} from './sandbox-types.js'

export interface FinalizeSandboxEvidenceInput {
  readonly request: SandboxExecutionRequest
  readonly result: SandboxExecutionResult
  readonly decision: SandboxBrokerDecision
  readonly authorization: SandboxAuthorizationContext
}

/**
 * The single persistence boundary for structured sandbox evidence. Raw source, stdin, arguments,
 * host paths, principal identifiers, and output never cross this function unredacted.
 */
export function finalizeSandboxExecutionEvidence(
  input: FinalizeSandboxEvidenceInput,
): SandboxExecutionResult {
  const outputExcerpt = excerptSandboxOutput(input.result.stdout, input.result.stderr)
  const policy = input.decision.policy
  return {
    ...input.result,
    outputTruncated:
      input.result.outputTruncated || outputExcerpt.includes('[TRUNCATED]'),
    evidence: {
      ...input.result.evidence,
      schemaVersion: 1,
      inputHash: sha256Text(JSON.stringify(requestEvidenceDescriptor(input.request))),
      ...(input.result.stdout.length === 0 && input.result.stderr.length === 0
        ? {}
        : { outputHash: sha256Text(`${input.result.stdout}\n${input.result.stderr}`) }),
      ...(outputExcerpt.length === 0 ? {} : { outputExcerpt }),
      policyDecision: input.decision.allowed ? 'allowed' : 'blocked',
      policyReason: input.decision.reason,
      decisionCode: input.decision.reasonCode,
      authorization: {
        deploymentMode: input.authorization.deploymentMode,
        callerKind: input.authorization.callerKind,
        capabilityId: policy?.requiredCapabilityId ?? 'unresolved',
        ...(input.authorization.grantId === undefined
          ? {}
          : { grantIdHash: sha256Text(input.authorization.grantId) }),
        ...(input.authorization.principalId === undefined
          ? {}
          : { principalIdHash: sha256Text(input.authorization.principalId) }),
        ...(input.authorization.approval === undefined
          ? {}
          : { approvalIdHash: sha256Text(input.authorization.approval.id) }),
      },
      ...(policy === undefined
        ? {}
        : {
            policy: {
              id: policy.policyId,
              version: policy.policyVersion,
              fingerprint: policy.fingerprint,
              intent: policy.intent,
              networkMode: policy.network.mode,
              dependencyMode: policy.dependencies.mode,
              workspaceMode: policy.workspace.mode,
              sourceVersions: Object.fromEntries(
                policy.sources.map((source) => [source.id, source.version]),
              ),
            },
          }),
    },
  }
}

function requestEvidenceDescriptor(request: SandboxExecutionRequest): Record<string, unknown> {
  return {
    languageId: request.languageId,
    mode: request.mode,
    ...(request.source === undefined
      ? {}
      : {
          source: {
            bytes: byteLength(request.source),
            sha256: sha256Text(request.source),
          },
        }),
    ...(request.files === undefined
      ? {}
      : { files: request.files.map(sourceFileEvidenceDescriptor) }),
    ...(request.repository === undefined
      ? {}
      : {
          repository: {
            rootPathHash: sha256Text(request.repository.rootPath),
            selectedPaths: request.repository.selectedPaths ?? [],
          },
        }),
    ...(request.stdin === undefined
      ? {}
      : {
          stdin: {
            bytes: byteLength(request.stdin),
            sha256: sha256Text(request.stdin),
          },
        }),
    ...(request.args === undefined
      ? {}
      : {
          args: {
            count: request.args.length,
            sha256: sha256Text(JSON.stringify(request.args)),
          },
        }),
    ...(request.limits === undefined ? {} : { requestedLimits: request.limits }),
    ...(request.missionId === undefined
      ? {}
      : { missionIdHash: sha256Text(request.missionId) }),
    ...(request.requestedRunnerId === undefined
      ? {}
      : { requestedRunnerId: request.requestedRunnerId }),
  }
}

function sourceFileEvidenceDescriptor(file: SandboxSourceFile): Record<string, unknown> {
  return {
    path: file.path,
    bytes: byteLength(file.content),
    sha256: sha256Text(file.content),
  }
}

function byteLength(value: string): number {
  return Buffer.byteLength(value, 'utf8')
}
