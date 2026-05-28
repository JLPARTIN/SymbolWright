import {
  AGENT_KERNEL_TRACE_BLOCK_IDS,
  AGENT_KERNEL_TRACE_REPLAY_BLOCK_ID,
  AGENT_KERNEL_TRACE_REPLAY_PHASE_ID,
  AGENT_KERNEL_TRACE_REPLAY_PR_ID,
  type AgentKernelBlockId,
  type AgentKernelTraceFrame,
  type AgentKernelTraceReplayInput,
  type AgentKernelTraceReplayReport,
} from './agent-kernel-trace.types.js';

const EXPECTED_LINEAGE: readonly AgentKernelBlockId[] = AGENT_KERNEL_TRACE_BLOCK_IDS;

function expectedPrIdFor(blockId: AgentKernelBlockId): string {
  return `PR-AK-${blockId.slice(-2)}`;
}

function expectedPhaseIdFor(blockId: AgentKernelBlockId): string {
  return `Phase-16G-AK-${blockId.slice(-2)}`;
}

function isIsoTimestamp(value: string): boolean {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value;
}

function validateLineage(frames: readonly AgentKernelTraceFrame[]): readonly string[] {
  const lineageErrors: string[] = [];
  const expectedPrefix = EXPECTED_LINEAGE.slice(0, frames.length);

  frames.forEach((frame, index) => {
    const expectedBlockId = expectedPrefix[index];
    if (frame.blockId !== expectedBlockId) {
      lineageErrors.push(
        `Frame ${index} expected ${expectedBlockId ?? 'NO_EXPECTED_BLOCK'} but received ${frame.blockId}.`,
      );
    }
  });

  if (frames.length > EXPECTED_LINEAGE.length) {
    lineageErrors.push(
      `Trace frame count ${frames.length} exceeds supported AGENT-KERNEL-01..06 lineage length.`,
    );
  }

  return lineageErrors;
}

function validateBlockMetadata(frames: readonly AgentKernelTraceFrame[]): readonly string[] {
  const blockIdErrors: string[] = [];

  frames.forEach((frame, index) => {
    if (!EXPECTED_LINEAGE.includes(frame.blockId)) {
      blockIdErrors.push(`Frame ${index} has unexpected blockId ${frame.blockId}.`);
      return;
    }

    const expectedPrId = expectedPrIdFor(frame.blockId);
    const expectedPhaseId = expectedPhaseIdFor(frame.blockId);

    if (frame.prId !== expectedPrId) {
      blockIdErrors.push(
        `Frame ${index} for ${frame.blockId} expected prId ${expectedPrId} but received ${frame.prId}.`,
      );
    }

    if (frame.phaseId !== expectedPhaseId) {
      blockIdErrors.push(
        `Frame ${index} for ${frame.blockId} expected phaseId ${expectedPhaseId} but received ${frame.phaseId}.`,
      );
    }

    if (!isIsoTimestamp(frame.timestamp)) {
      blockIdErrors.push(`Frame ${index} for ${frame.blockId} has a non-ISO timestamp.`);
    }
  });

  return blockIdErrors;
}

function validateInvariants(frames: readonly AgentKernelTraceFrame[]): readonly string[] {
  const invariantViolations: string[] = [];

  frames.forEach((frame) => {
    if (frame.invariants.providerInvoked !== false) {
      invariantViolations.push(`providerInvoked invariant violated in ${frame.blockId}.`);
    }

    if (frame.invariants.repoMutationAllowed !== false) {
      invariantViolations.push(`repoMutationAllowed invariant violated in ${frame.blockId}.`);
    }

    if (frame.invariants.commandExecutionAllowed !== false) {
      invariantViolations.push(`commandExecutionAllowed invariant violated in ${frame.blockId}.`);
    }
  });

  return invariantViolations;
}

function collectWarnings(frames: readonly AgentKernelTraceFrame[]): readonly string[] {
  return frames.flatMap((frame) => frame.warnings.map((warning) => `${frame.blockId}: ${warning}`));
}

export class AgentKernelTraceReplayService {
  replay(input: AgentKernelTraceReplayInput): AgentKernelTraceReplayReport {
    const frames = input.frames.filter((frame) => frame.executionId === input.executionId);
    const droppedFrameCount = input.frames.length - frames.length;
    const lineageErrors = [...validateLineage(frames)];
    const blockIdErrors = [...validateBlockMetadata(frames)];
    const invariantViolations = [...validateInvariants(frames)];
    const warnings = [...collectWarnings(frames)];

    if (droppedFrameCount > 0) {
      lineageErrors.push(
        `Dropped ${droppedFrameCount} frame(s) because executionId did not match ${input.executionId}.`,
      );
    }

    return {
      blockId: AGENT_KERNEL_TRACE_REPLAY_BLOCK_ID,
      prId: AGENT_KERNEL_TRACE_REPLAY_PR_ID,
      phaseId: AGENT_KERNEL_TRACE_REPLAY_PHASE_ID,
      executionId: input.executionId,
      lineageValid: lineageErrors.length === 0,
      lineageErrors,
      blockIdValid: blockIdErrors.length === 0,
      blockIdErrors,
      invariantsValid: invariantViolations.length === 0,
      invariantViolations,
      warnings,
      summary: {
        frameCount: frames.length,
        firstBlockId: frames[0]?.blockId,
        lastBlockId: frames.at(-1)?.blockId,
        warningCount: warnings.length,
      },
    };
  }
}
