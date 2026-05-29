import {
  AgentKernelTraceReplayService,
} from '../kernel/agent-kernel-trace-replay.service.js';
import {
  type AgentKernelBlockId,
  type AgentKernelTraceFrame,
} from '../kernel/agent-kernel-trace.types.js';

export const CODEMIND_KERNEL_TRACE_PROOF_BLOCK_ID = 'CODEMIND-PROOF-HARNESS-02' as const;
export const CODEMIND_KERNEL_TRACE_PROOF_PR_ID = 'PR-CM-TEST-02' as const;
export const CODEMIND_KERNEL_TRACE_PROOF_PHASE_ID = 'CODEMIND-TEST-02' as const;

export const CODEMIND_KERNEL_TRACE_PROOF_STATUSES = [
  'TRACE_PROOF_READY',
  'TRACE_PROOF_PARTIAL',
  'TRACE_PROOF_BLOCKED',
  'TRACE_PROOF_INVALID',
] as const;
export type CodemindKernelTraceProofStatus =
  (typeof CODEMIND_KERNEL_TRACE_PROOF_STATUSES)[number];

export interface CodemindKernelTraceProofInput {
  readonly executionId: string;
  readonly requiredBlockIds: readonly AgentKernelBlockId[];
  readonly evidenceFrames: readonly AgentKernelTraceFrame[];
  readonly blockingNotes?: readonly string[];
}

export interface CodemindKernelTraceProofReport {
  readonly blockId: typeof CODEMIND_KERNEL_TRACE_PROOF_BLOCK_ID;
  readonly prId: typeof CODEMIND_KERNEL_TRACE_PROOF_PR_ID;
  readonly phaseId: typeof CODEMIND_KERNEL_TRACE_PROOF_PHASE_ID;
  readonly status: CodemindKernelTraceProofStatus;
  readonly coveredBlockIds: readonly AgentKernelBlockId[];
  readonly missingBlockIds: readonly AgentKernelBlockId[];
  readonly blockingNotes: readonly string[];
  readonly replayErrors: readonly string[];
  readonly invariants: {
    readonly providerInvoked: false;
    readonly repoMutationAllowed: false;
    readonly commandExecutionAllowed: false;
  };
  readonly summary: string;
}

const replayService = new AgentKernelTraceReplayService();

function resolveStatus(
  blockingNotes: readonly string[],
  replayErrors: readonly string[],
  coveredCount: number,
  requiredCount: number,
): CodemindKernelTraceProofStatus {
  if (blockingNotes.length > 0) {
    return 'TRACE_PROOF_BLOCKED';
  }
  if (replayErrors.length > 0) {
    return 'TRACE_PROOF_INVALID';
  }
  if (requiredCount === 0 || coveredCount === 0) {
    return 'TRACE_PROOF_PARTIAL';
  }
  if (coveredCount === requiredCount) {
    return 'TRACE_PROOF_READY';
  }
  return 'TRACE_PROOF_PARTIAL';
}

export function buildCodemindKernelTraceProofReport(
  input: CodemindKernelTraceProofInput,
): CodemindKernelTraceProofReport {
  const blockingNotes = [...(input.blockingNotes ?? [])].sort((a, b) =>
    a.localeCompare(b),
  );

  // Pre-filter to matching executionId so dropped-frame noise doesn't become replay errors.
  const matchingFrames = input.evidenceFrames.filter(
    (f) => f.executionId === input.executionId,
  );

  const replayReport = replayService.replay({
    executionId: input.executionId,
    frames: matchingFrames,
  });

  const replayErrors = [
    ...replayReport.lineageErrors,
    ...replayReport.blockIdErrors,
    ...replayReport.invariantViolations,
  ];

  const validFrameBlockIds = new Set(
    replayErrors.length === 0
      ? matchingFrames.map((f) => f.blockId)
      : [],
  );

  const coveredBlockIds = input.requiredBlockIds.filter((id) =>
    validFrameBlockIds.has(id),
  );
  const missingBlockIds = input.requiredBlockIds.filter(
    (id) => !validFrameBlockIds.has(id),
  );

  const status = resolveStatus(
    blockingNotes,
    replayErrors,
    coveredBlockIds.length,
    input.requiredBlockIds.length,
  );

  const summary =
    blockingNotes.length > 0
      ? `Kernel trace proof blocked: ${blockingNotes.length} blocking note(s).`
      : replayErrors.length > 0
        ? `Kernel trace proof invalid: ${replayErrors.length} replay error(s).`
        : `${coveredBlockIds.length}/${input.requiredBlockIds.length} kernel trace blocks covered.`;

  return {
    blockId: CODEMIND_KERNEL_TRACE_PROOF_BLOCK_ID,
    prId: CODEMIND_KERNEL_TRACE_PROOF_PR_ID,
    phaseId: CODEMIND_KERNEL_TRACE_PROOF_PHASE_ID,
    status,
    coveredBlockIds,
    missingBlockIds,
    blockingNotes,
    replayErrors,
    invariants: {
      providerInvoked: false,
      repoMutationAllowed: false,
      commandExecutionAllowed: false,
    },
    summary,
  };
}
