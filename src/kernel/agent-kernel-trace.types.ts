export const AGENT_KERNEL_TRACE_REPLAY_BLOCK_ID = 'AGENT-KERNEL-07' as const;
export const AGENT_KERNEL_TRACE_REPLAY_PR_ID = 'PR-AK-07' as const;
export const AGENT_KERNEL_TRACE_REPLAY_PHASE_ID = 'Phase-16G-AK-07' as const;

export const AGENT_KERNEL_TRACE_BLOCK_IDS = [
  'AGENT-KERNEL-01',
  'AGENT-KERNEL-02',
  'AGENT-KERNEL-03',
  'AGENT-KERNEL-04',
  'AGENT-KERNEL-05',
  'AGENT-KERNEL-06',
] as const;
export type AgentKernelBlockId = (typeof AGENT_KERNEL_TRACE_BLOCK_IDS)[number];

export const AGENT_KERNEL_TRACE_PAYLOAD_KINDS = [
  'PLANNING',
  'WORKFLOW_VALIDATION',
  'SKILL_VALIDATION',
  'CONTEXT_PACKET',
  'ROUTE_RECOMMENDATION',
  'ROUTE_PREFLIGHT',
] as const;
export type AgentKernelTracePayloadKind =
  (typeof AGENT_KERNEL_TRACE_PAYLOAD_KINDS)[number];

export interface AgentKernelTraceFrame {
  readonly blockId: AgentKernelBlockId;
  readonly prId: string;
  readonly phaseId: string;
  readonly executionId: string;
  readonly timestamp: string;
  readonly payloadSummary: {
    readonly kind: AgentKernelTracePayloadKind;
    readonly providerReady?: boolean;
  };
  readonly invariants: {
    readonly providerInvoked: boolean;
    readonly repoMutationAllowed: boolean;
    readonly commandExecutionAllowed: boolean;
  };
  readonly warnings: readonly string[];
}

export interface AgentKernelTraceReplayInput {
  readonly executionId: string;
  readonly frames: readonly AgentKernelTraceFrame[];
}

export interface AgentKernelTraceReplaySummary {
  readonly frameCount: number;
  readonly firstBlockId?: AgentKernelBlockId;
  readonly lastBlockId?: AgentKernelBlockId;
  readonly warningCount: number;
}

export interface AgentKernelTraceReplayReport {
  readonly blockId: typeof AGENT_KERNEL_TRACE_REPLAY_BLOCK_ID;
  readonly prId: typeof AGENT_KERNEL_TRACE_REPLAY_PR_ID;
  readonly phaseId: typeof AGENT_KERNEL_TRACE_REPLAY_PHASE_ID;
  readonly executionId: string;
  readonly lineageValid: boolean;
  readonly lineageErrors: readonly string[];
  readonly blockIdValid: boolean;
  readonly blockIdErrors: readonly string[];
  readonly invariantsValid: boolean;
  readonly invariantViolations: readonly string[];
  readonly warnings: readonly string[];
  readonly summary: AgentKernelTraceReplaySummary;
}
