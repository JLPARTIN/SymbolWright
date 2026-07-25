import type { AccessRuntime } from '../access/access-runtime.js'
import { AgentWorkspaceService } from './agent-workspace-service.js'
import { ChangeCandidateService } from './change-candidate-service.js'
import { CollaborationMessageService } from './collaboration-message-service.js'
import { CollaborativeTaskService } from './collaborative-task-service.js'
import { OrchestrationStore } from './orchestration-store.js'
import { ReviewService } from './review-service.js'
import { SharedContextService } from './shared-context-service.js'
import { TaskAssignmentEngine } from './task-assignment-engine.js'
import { TeamService } from './team-service.js'
import { TeamIntegrationService } from './integration-engine.js'

export interface OrchestrationRuntimeOptions {
  readonly workspaceRoot: string
  readonly accessRuntime: AccessRuntime
}

/**
 * Bundles the multi-agent orchestration subsystem's services for a given workspace, constructed
 * once per server process — mirrors `AccessRuntime`/`MissionService` construction. This is the
 * one composition root every REST route, MCP tool, and UI view should depend on so the REST and
 * MCP surfaces always share the same live services (Section 39, AC29), never a parallel copy.
 */
export class OrchestrationRuntime {
  public readonly store: OrchestrationStore
  public readonly teamService: TeamService
  public readonly taskService: CollaborativeTaskService
  public readonly assignmentEngine: TaskAssignmentEngine
  public readonly workspaceService: AgentWorkspaceService
  public readonly contextService: SharedContextService
  public readonly messageService: CollaborationMessageService
  public readonly candidateService: ChangeCandidateService
  public readonly reviewService: ReviewService
  public readonly integrationService: TeamIntegrationService

  public constructor(options: OrchestrationRuntimeOptions) {
    this.store = new OrchestrationStore({ workspaceRoot: options.workspaceRoot })
    this.teamService = new TeamService(this.store, options.accessRuntime)
    this.taskService = new CollaborativeTaskService(this.store)
    this.assignmentEngine = new TaskAssignmentEngine(this.store)
    this.workspaceService = new AgentWorkspaceService(this.store)
    this.contextService = new SharedContextService(this.store)
    this.messageService = new CollaborationMessageService(this.store)
    this.candidateService = new ChangeCandidateService(this.store, options.workspaceRoot)
    this.reviewService = new ReviewService(this.store)
    this.integrationService = new TeamIntegrationService(this.store)
  }
}
