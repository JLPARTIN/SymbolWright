export {
  CODEMIND_AJNA_CAPABILITY_NAME,
  CODEMIND_PLATFORM_NAME,
  getCodemindFoundationSnapshot,
} from './codemind-foundation.js'
export type { CodemindFoundationSnapshot, CodemindRuntimePosture } from './codemind-foundation.js'

export {
  evaluateCodemindPermissionRequest,
  resolveHighestDisposition,
} from './permissions/codemind-permission-policy.js'
export {
  CODEMIND_MODES,
  CODEMIND_PERMISSION_DISPOSITIONS,
  CODEMIND_PROTECTED_PATH_CLASSES,
  CODEMIND_RISK_LEVELS,
  CODEMIND_TARGET_KINDS,
  CODEMIND_TOOL_CATEGORIES,
  CODEMIND_TRUST_ZONES,
} from './permissions/codemind-permission.types.js'
export type {
  CodemindMode,
  CodemindPermissionDecision,
  CodemindPermissionDisposition,
  CodemindPermissionRequest,
  CodemindProtectedPathClass,
  CodemindProtectedPathHit,
  CodemindRiskLevel,
  CodemindTarget,
  CodemindTargetKind,
  CodemindToolCategory,
  CodemindTrustZone,
} from './permissions/codemind-permission.types.js'

export {
  canAjnaDeclareMergeReady,
  deriveAjnaMergeReadiness,
  isAjnaBlockedStatus,
} from './ajna/ajna-merge-readiness.js'
export { renderAjnaReviewReport } from './ajna/ajna-review-renderer.js'
export {
  AJNA_EVIDENCE_CLASSES,
  AJNA_FINDING_CATEGORIES,
  AJNA_MERGE_READINESS_STATUSES,
  AJNA_RISK_LEVELS,
} from './ajna/ajna-review.types.js'
export type {
  AjnaEvidenceClass,
  AjnaEvidenceRef,
  AjnaFindingCategory,
  AjnaMergeReadiness,
  AjnaMergeReadinessStatus,
  AjnaReviewFinding,
  AjnaReviewRequest,
  AjnaReviewResponse,
  AjnaReviewSubject,
  AjnaRiskLevel,
} from './ajna/ajna-review.types.js'

export {
  countProtectedChangedFiles,
  getHighestRepoImpactLevel,
  hasRequiredEvidenceState,
  summarizeReadOnlyRepoContext,
} from './repo-context/repo-context-summary.js'
export type { CodemindRepoContextSummary } from './repo-context/repo-context-summary.js'
export {
  CODEMIND_EVIDENCE_STATES,
  CODEMIND_REPO_FILE_CHANGE_TYPES,
  CODEMIND_REPO_FILE_IMPACT_LEVELS,
} from './repo-context/repo-context.types.js'
export type {
  CodemindChangedFileContext,
  CodemindCiEvidenceContext,
  CodemindDiffHunkContext,
  CodemindEvidenceState,
  CodemindReadOnlyRepoContext,
  CodemindRepoFileChangeType,
  CodemindRepoFileImpactLevel,
  CodemindRepoRef,
  CodemindRepositoryIdentity,
  CodemindTestEvidenceContext,
} from './repo-context/repo-context.types.js'

export {
  assertGithubPrContextIsReadOnly,
  createReadOnlyGithubPrContextResponse,
} from './github/github-pr-context-contract.js'
export {
  CODEMIND_GITHUB_PR_ADAPTER_MODES,
  CODEMIND_GITHUB_PR_CONTEXT_INPUTS,
} from './github/github-pr-context.types.js'
export type {
  CodemindGithubPrAdapterMode,
  CodemindGithubPrContextAdapterRequest,
  CodemindGithubPrContextAdapterResponse,
  CodemindGithubPrContextInput,
  CodemindGithubPullRequestIdentity,
} from './github/github-pr-context.types.js'

export {
  AGENT_KERNEL_DEFAULT_ROLE_PROFILES,
  AGENT_KERNEL_DEFAULT_SKILLS,
} from './kernel/agent-kernel-defaults.js'
export { planAgentKernel01 } from './kernel/agent-kernel-planner.js'
export {
  AGENT_KERNEL_BLOCK_ID,
  AGENT_KERNEL_MEMORY_SCOPES,
  AGENT_KERNEL_PHASE_ID,
  AGENT_KERNEL_PHASES,
  AGENT_KERNEL_PR_ID,
  AGENT_KERNEL_ROLES,
  AGENT_KERNEL_SKILL_RISK_CLASSES,
  AGENT_KERNEL_STEP_KINDS,
} from './kernel/agent-kernel.types.js'
export type {
  AgentKernelMemoryScope,
  AgentKernelPhase,
  AgentKernelPlanningDecision,
  AgentKernelPlanningRequest,
  AgentKernelRole,
  AgentKernelRoleProfile,
  AgentKernelSkillDeclaration,
  AgentKernelSkillRiskClass,
  AgentKernelStepKind,
  AgentKernelWorkflowStep,
} from './kernel/agent-kernel.types.js'

export { validateAgentKernelWorkflow } from './kernel/agent-kernel-workflow-validator.js'
export {
  AGENT_KERNEL_WORKFLOW_FINDING_CODES,
  AGENT_KERNEL_WORKFLOW_FINDING_SEVERITIES,
  AGENT_KERNEL_WORKFLOW_VALIDATOR_BLOCK_ID,
  AGENT_KERNEL_WORKFLOW_VALIDATOR_PHASE_ID,
  AGENT_KERNEL_WORKFLOW_VALIDATOR_PR_ID,
} from './kernel/agent-kernel-workflow-validator.js'
export type {
  AgentKernelWorkflowFindingCode,
  AgentKernelWorkflowFindingSeverity,
  AgentKernelWorkflowValidationFinding,
  AgentKernelWorkflowValidationReport,
} from './kernel/agent-kernel-workflow-validator.js'

export {
  createAgentKernelSkillProposal,
  getAgentKernelSkillRegistrySnapshot,
  lookupAgentKernelSkill,
  rankAgentKernelSkillRisk,
  reviewAgentKernelSkillProposal,
} from './kernel/agent-kernel-skill-registry.js'
export {
  AGENT_KERNEL_SKILL_PROPOSAL_STATUSES,
  AGENT_KERNEL_SKILL_REGISTRY_BLOCK_ID,
  AGENT_KERNEL_SKILL_REGISTRY_PHASE_ID,
  AGENT_KERNEL_SKILL_REGISTRY_PR_ID,
} from './kernel/agent-kernel-skill-registry.js'
export type {
  AgentKernelSkillLookupResult,
  AgentKernelSkillProposal,
  AgentKernelSkillProposalReview,
  AgentKernelSkillProposalStatus,
  AgentKernelSkillRegistrySnapshot,
} from './kernel/agent-kernel-skill-registry.js'

export { validateAgentKernelSkillUse } from './kernel/agent-kernel-skill-validator.js'
export {
  AGENT_KERNEL_SKILL_VALIDATION_FINDING_CODES,
  AGENT_KERNEL_SKILL_VALIDATION_SEVERITIES,
} from './kernel/agent-kernel-skill-validator.js'
export type {
  AgentKernelSkillUseRequest,
  AgentKernelSkillValidationFinding,
  AgentKernelSkillValidationFindingCode,
  AgentKernelSkillValidationReport,
  AgentKernelSkillValidationSeverity,
} from './kernel/agent-kernel-skill-validator.js'

export { buildAgentKernelContextPacket } from './kernel/agent-kernel-context-packet.js'
export {
  AGENT_KERNEL_CONTEXT_PACKET_BLOCK_ID,
  AGENT_KERNEL_CONTEXT_PACKET_PHASE_ID,
  AGENT_KERNEL_CONTEXT_PACKET_PR_ID,
  AGENT_KERNEL_CONTEXT_PACKET_SECTIONS,
  AGENT_KERNEL_CONTEXT_PRIORITIES,
} from './kernel/agent-kernel-context-packet.js'
export type {
  AgentKernelContextPacket,
  AgentKernelContextPacketBoundary,
  AgentKernelContextPacketBuilderInput,
  AgentKernelContextPacketItem,
  AgentKernelContextPacketSection,
  AgentKernelContextPriority,
  AgentKernelRepoContextReference,
} from './kernel/agent-kernel-context-packet.js'

export { planAgentKernelProviderRoute } from './kernel/agent-kernel-provider-routing-gateway.js'
export {
  AGENT_KERNEL_PROVIDER_ROUTE_FINDING_CODES,
  AGENT_KERNEL_PROVIDER_ROUTE_SEVERITIES,
  AGENT_KERNEL_PROVIDER_ROUTE_TYPES,
  AGENT_KERNEL_PROVIDER_ROUTING_BLOCK_ID,
  AGENT_KERNEL_PROVIDER_ROUTING_PHASE_ID,
  AGENT_KERNEL_PROVIDER_ROUTING_PR_ID,
} from './kernel/agent-kernel-provider-routing-gateway.js'
export type {
  AgentKernelProviderRouteFinding,
  AgentKernelProviderRouteFindingCode,
  AgentKernelProviderRoutePlan,
  AgentKernelProviderRoutePolicy,
  AgentKernelProviderRouteSeverity,
  AgentKernelProviderRouteType,
} from './kernel/agent-kernel-provider-routing-gateway.js'

export { preflightAgentKernelRouteExecution } from './kernel/agent-kernel-route-execution-preflight.js'
export {
  AGENT_KERNEL_ROUTE_PREFLIGHT_BLOCK_ID,
  AGENT_KERNEL_ROUTE_PREFLIGHT_FINDING_CODES,
  AGENT_KERNEL_ROUTE_PREFLIGHT_PHASE_ID,
  AGENT_KERNEL_ROUTE_PREFLIGHT_PR_ID,
  AGENT_KERNEL_ROUTE_PREFLIGHT_SEVERITIES,
} from './kernel/agent-kernel-route-execution-preflight.js'
export type {
  AgentKernelRouteExecutionPolicy,
  AgentKernelRouteExecutionPreflightDecision,
  AgentKernelRoutePreflightFinding,
  AgentKernelRoutePreflightFindingCode,
  AgentKernelRoutePreflightSeverity,
} from './kernel/agent-kernel-route-execution-preflight.js'

export { AgentKernelTraceReplayService } from './kernel/agent-kernel-trace-replay.service.js'
export {
  AGENT_KERNEL_TRACE_BLOCK_IDS,
  AGENT_KERNEL_TRACE_PAYLOAD_KINDS,
  AGENT_KERNEL_TRACE_REPLAY_BLOCK_ID,
  AGENT_KERNEL_TRACE_REPLAY_PHASE_ID,
  AGENT_KERNEL_TRACE_REPLAY_PR_ID,
} from './kernel/agent-kernel-trace.types.js'
export type {
  AgentKernelBlockId,
  AgentKernelTraceFrame,
  AgentKernelTracePayloadKind,
  AgentKernelTraceReplayInput,
  AgentKernelTraceReplayReport,
  AgentKernelTraceReplaySummary,
} from './kernel/agent-kernel-trace.types.js'

export {
  checkBuildLedgerConsistency,
  createBuildLedgerEntry,
  createBuildLedgerSummary,
  renderBuildLedgerConsistencyReport,
  renderBuildLedgerSummary,
} from './build-state/codemind-build-ledger.js'
export type {
  BuildLedgerConsistencyFinding,
  BuildLedgerConsistencyReport,
  BuildLedgerConsistencyStatus,
  BuildLedgerEntry,
  BuildLedgerSummary,
} from './build-state/codemind-build-ledger.js'

export {
  PROJECT_INSTRUCTION_FILES,
  createProjectInstruction,
  createProjectInstructionSet,
  renderProjectInstructionSet,
} from './context/project-instructions.js'
export type {
  ProjectInstruction,
  ProjectInstructionFileName,
  ProjectInstructionSet,
} from './context/project-instructions.js'

export {
  loadProjectInstruction,
  loadProjectInstructionSet,
} from './context/project-instructions-loader.js'

export type {
  GitHubHttpClient,
  GitHubHttpClientOptions,
  GitHubHttpResponse,
} from './runtime/live-read/github-http-client.js'
export { DefaultGitHubHttpClient } from './runtime/live-read/github-http-client.js'

export { redactGitHubContent, redactUnknownBody } from './runtime/live-read/github-live-read-redaction.js'

export {
  runValidationCommand,
  renderValidationExecutorResult,
} from './runtime/validation/validation-command-executor.js'
export type {
  ValidationExecutorOutcome,
  ValidationExecutorResult,
} from './runtime/validation/validation-command-executor.js'

export {
  createValidationTranscript,
  renderValidationTranscript,
} from './runtime/validation/validation-command-transcript.js'
export type {
  ValidationCommandTranscript,
  ValidationCommandTranscriptInput,
} from './runtime/validation/validation-command-transcript.js'

export { redactValidationOutput } from './runtime/validation/validation-output-redactor.js'

export {
  analyzeCiOutput,
  renderCiDiagnosticReport,
} from './runtime/ci/ci-diagnostics.js'
export type {
  CiDiagnosticFinding,
  CiDiagnosticReport,
  CiDiagnosticSeverity,
} from './runtime/ci/ci-diagnostics.js'

export {
  buildProjectContextPacket,
  renderProjectContextPacket,
} from './context/project-context-kernel.js'
export type {
  PackageScriptEntry,
  ProjectContextPacket,
  WorkflowEntry,
} from './context/project-context-kernel.js'

export {
  buildAgentKernelMissionPacket,
  renderAgentKernelMissionPacket,
  AGENT_KERNEL_MISSION_FINDING_CODES,
  AGENT_KERNEL_MISSION_FINDING_SEVERITIES,
  AGENT_KERNEL_MISSION_PACKET_BLOCK_ID,
  AGENT_KERNEL_MISSION_PACKET_PHASE_ID,
  AGENT_KERNEL_MISSION_PACKET_PR_ID,
  AGENT_KERNEL_MISSION_STATUSES,
} from './kernel/agent-kernel-mission-packet.js'
export type {
  AgentKernelMissionConstraint,
  AgentKernelMissionExecutionBoundary,
  AgentKernelMissionFinding,
  AgentKernelMissionFindingCode,
  AgentKernelMissionFindingSeverity,
  AgentKernelMissionObjective,
  AgentKernelMissionPacket,
  AgentKernelMissionPacketInput,
  AgentKernelMissionStatus,
  AgentKernelMissionSuccessCriterion,
} from './kernel/agent-kernel-mission-packet.js'

export {
  executeGitHubWrite,
  GITHUB_WRITE_EXECUTOR_ACTIONS,
  renderGitHubWriteExecutorResult,
} from './runtime/github-write/github-write-executor.js'
export type {
  GitHubWriteExecutorAction,
  GitHubWriteExecutorClient,
  GitHubWriteExecutorClientResult,
  GitHubWriteExecutorOutcome,
  GitHubWriteExecutorRequest,
  GitHubWriteExecutorResult,
} from './runtime/github-write/github-write-executor.js'

export {
  executeRepairLoop,
  renderRepairLoopResult,
} from './runtime/repair/repair-loop.js'
export type {
  RepairLoopAjnaReassessment,
  RepairLoopCheckpoint,
  RepairLoopFinding,
  RepairLoopOperatorReview,
  RepairLoopOutcome,
  RepairLoopPatchProposal,
  RepairLoopRequest,
  RepairLoopResult,
  RepairLoopValidationResult,
} from './runtime/repair/repair-loop.js'

export { buildCodemindProofHarnessReport } from './testing/codemind-proof-harness.js'
export {
  CODEMIND_PROOF_HARNESS_BLOCK_ID,
  CODEMIND_PROOF_HARNESS_DOMAINS,
  CODEMIND_PROOF_HARNESS_PHASE_ID,
  CODEMIND_PROOF_HARNESS_PR_ID,
  CODEMIND_PROOF_HARNESS_STATES,
} from './testing/codemind-proof-harness.js'
export type {
  CodemindProofHarnessDomain,
  CodemindProofHarnessDomainInput,
  CodemindProofHarnessDomainReport,
  CodemindProofHarnessReport,
  CodemindProofHarnessState,
} from './testing/codemind-proof-harness.js'
