import type { AgentKernelRole } from '../kernel/agent-kernel.types.js'
import type { SwarmAgentType, SwarmAgent, SwarmAgentCapabilities } from './hivemind.types.js'

export interface SwarmAgentConfig {
  readonly agentType: SwarmAgentType
  readonly role: AgentKernelRole
  readonly capabilities: SwarmAgentCapabilities
  readonly systemPromptSuffix: string
}

const ROLE_TO_AGENT_TYPE: Record<AgentKernelRole, SwarmAgentType> = {
  orchestrator: 'investigator',
  researcher: 'investigator',
  coder: 'coder',
  validator: 'analyzer',
  scheduler: 'reporter',
  'memory-auditor': 'reporter',
}

const DEFAULT_AGENT_CONFIGS: readonly SwarmAgentConfig[] = [
  {
    agentType: 'investigator',
    role: 'researcher',
    capabilities: {
      toolCategories: ['FILE_READER', 'SEARCH_READER', 'REPO_METADATA_READER', 'GIT_READER'],
      canRead: true,
      canWrite: false,
      canExecuteCommands: false,
      canReview: false,
    },
    systemPromptSuffix:
      'You are an investigator agent. Explore the codebase, find relevant files, understand structure. Read-only access.',
  },
  {
    agentType: 'coder',
    role: 'coder',
    capabilities: {
      toolCategories: ['FILE_READER', 'SEARCH_READER', 'PATCH_PROPOSER', 'PATCH_APPLIER'],
      canRead: true,
      canWrite: true,
      canExecuteCommands: false,
      canReview: false,
    },
    systemPromptSuffix:
      'You are a coder agent. Read files, understand context, and implement changes. Write access with approval.',
  },
  {
    agentType: 'analyzer',
    role: 'validator',
    capabilities: {
      toolCategories: ['FILE_READER', 'SEARCH_READER', 'COMMAND_RUNNER'],
      canRead: true,
      canWrite: false,
      canExecuteCommands: true,
      canReview: false,
    },
    systemPromptSuffix:
      'You are an analyzer agent. Run tests, typecheck, and lint. Report results. Command execution with approval.',
  },
  {
    agentType: 'reviewer',
    role: 'validator',
    capabilities: {
      toolCategories: ['FILE_READER', 'SEARCH_READER', 'AJNA_REVIEWER'],
      canRead: true,
      canWrite: false,
      canExecuteCommands: false,
      canReview: true,
    },
    systemPromptSuffix:
      'You are a reviewer agent. Use Ajna review pipeline to assess code quality, risk, and merge readiness.',
  },
  {
    agentType: 'reporter',
    role: 'memory-auditor',
    capabilities: {
      toolCategories: ['FILE_READER', 'PROJECT_DOC_READER'],
      canRead: true,
      canWrite: false,
      canExecuteCommands: false,
      canReview: false,
    },
    systemPromptSuffix:
      'You are a reporter agent. Track lineage, summarize findings, and report status. Read-only access.',
  },
]

export class HiveMindRegistry {
  private readonly configs = new Map<SwarmAgentType, SwarmAgentConfig>()
  private agentCounter = 0

  constructor(configs: readonly SwarmAgentConfig[] = DEFAULT_AGENT_CONFIGS) {
    for (const config of configs) {
      this.configs.set(config.agentType, config)
    }
  }

  getConfig(agentType: SwarmAgentType): SwarmAgentConfig | undefined {
    return this.configs.get(agentType)
  }

  getConfigForRole(role: AgentKernelRole): SwarmAgentConfig | undefined {
    const agentType = ROLE_TO_AGENT_TYPE[role]
    return this.configs.get(agentType)
  }

  createAgent(agentType: SwarmAgentType): SwarmAgent | undefined {
    const config = this.configs.get(agentType)
    if (config === undefined) return undefined

    this.agentCounter++
    return {
      agentId: `swarm-${agentType}-${this.agentCounter}`,
      agentType,
      role: config.role,
      status: 'idle',
      capabilities: config.capabilities,
    }
  }

  listAgentTypes(): readonly SwarmAgentType[] {
    return [...this.configs.keys()]
  }

  roleToAgentType(role: AgentKernelRole): SwarmAgentType {
    return ROLE_TO_AGENT_TYPE[role]
  }
}
