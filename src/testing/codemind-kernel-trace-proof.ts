import {
  AGENT_KERNEL_TRACE_BLOCK_IDS,
  AGENT_KERNEL_TRACE_REPLAY_BLOCK_ID,
  type AgentKernelBlockId,
  type AgentKernelTraceReplayReport,
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
  readonly replayReport: AgentKernelTraceReplayReport;
  readonly requiredBlockIds?: readonly AgentKernelBlockId[];
  readonly blockingNotes?: readonly string[];
}

export interface CodemindKernelTraceProofReport {
  readonly blockId: typeof CODEMIND_KERNEL_TRACE_PROOF_BLOCK_ID;
  readonly prId: typeof CODEMIND_KERNEL_TRACE_PROOF_PR_ID;
  readonly phaseId: typeof CODEMIND_KERNEL_TRACE_PROOF_PHASE_ID;
  readonly sourceReplayBlockId: typeof AGENT_KERNEL_TRACE_REPLAY_BLOCK_ID;
  readonly executionId: string;
  readonly requiredBlockIds: readonly AgentKernelBlockId[];
  readonly observedBlockIds: readonly AgentKernelBlockId[];
  readonly missingBlockIds: readonly AgentKernelBlockId[];
  readonly lineageValid: boolean;
  readonly metadataValid: boolean;
  readonly invariantsValid: boolean;
  readonly status: CodemindKernelTraceProofStatus;
  readonly blockingNotes: readonly string[];
  readonly findings: readonly string[];
  readonly providerInvocationAllowed: false;
  readonly repoMutationAllowed: false;
  readonly commandExecutionAllowed: false;
  readonly summary: string;
}

function uniqueOrdered<T extends string>(values: readonly T[]): readonly T[] {
  const seen = new Set<T>();
  const output: T[] = [];

  values.forEach((value) => {
    if (!seen.has(value)) {
      seen.add(value);
      output.push(value);
    }
  });

  return output;
}

function resolveKernelTraceProofStatus(input: {
  readonly missingBlockIds: readonly AgentKernelBlockId[];
  readonly lineageValid: boolean;
  readonly metadataValid: boolean;
  readonly invariantsValid: boolean;
  readonly blockingNotes: readonly string[];
}): CodemindKernelTraceProofStatus {
  if (input.blockingNotes.length > 0) {
    return 'TRACE_PROOF_BLOCKED';
  }

  if (!input.lineageValid || !input.metadataValid || !input.invariantsValid) {
    return 'TRACE_PROOF_INVALID';
  }

  if (input.missingBlockIds.length > 0) {
    return 'TRACE_PROOF_PARTIAL';
  }

  return 'TRACE_PROOF_READY';
}

export function buildCodemindKernelTraceProofReport(
  input: CodemindKernelTraceProofInput,
): CodemindKernelTraceProofReport {
  const requiredBlockIds = input.requiredBlockIds ?? AGENT_KERNEL_TRACE_BLOCK_IDS;
  const observedBlockIds = uniqueOrdered([
    ...(input.replayReport.summary.firstBlockId ? [input.replayReport.summary.firstBlockId] : []),
    ...(input.replayReport.summary.lastBlockId ? [input.replayReport.summary.lastBlockId] : []),
  ]);
  const missingBlockIds = requiredBlockIds.filter((blockId) => !observedBlockIds.includes(blockId));
  const blockingNotes = uniqueOrdered(input.blockingNotes ?? []);

  const findings = [
    ...input.replayReport.lineageErrors,
    ...input.replayReport.blockIdErrors,
    ...input.replayReport.invariantViolations,
    ...missingBlockIds.map((blockId) => `Missing replay evidence for ${blockId}.`),
    ...blockingNotes.map((note) => `Blocking note: ${note}`),
  ];

  const status = resolveKernelTraceProofStatus({
    missingBlockIds,
    lineageValid: input.replayReport.lineageValid,
    metadataValid: input.replayReport.blockIdValid,
    invariantsValid: input.replayReport.invariantsValid,
    blockingNotes,
  });

  return {
    blockId: CODEMIND_KERNEL_TRACE_PROOF_BLOCK_ID,
    prId: CODEMIND_KERNEL_TRACE_PROOF_PR_ID,
    phaseId: CODEMIND_KERNEL_TRACE_PROOF_PHASE_ID,
    sourceReplayBlockId: AGENT_KERNEL_TRACE_REPLAY_BLOCK_ID,
    executionId: input.replayReport.executionId,
    requiredBlockIds,
    observedBlockIds,
    missingBlockIds,
    lineageValid: input.replayReport.lineageValid,
    metadataValid: input.replayReport.blockIdValid,
    invariantsValid: input.replayReport.invariantsValid,
    status,
    blockingNotes,
    findings,
    providerInvocationAllowed: false,
    repoMutationAllowed: false,
    commandExecutionAllowed: false,
    summary: `${observedBlockIds.length}/${requiredBlockIds.length} kernel trace proof blocks observed.`,
  };
}
