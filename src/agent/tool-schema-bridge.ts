import type {
  RuntimeToolDefinition,
  RuntimePolicySnapshot,
  CodemindRuntimeMode,
} from '../runtime/types.js'
import type { ProviderToolDefinition, ProviderToolInputSchema } from '../provider/provider.types.js'
import { assertValidPolicy } from '../runtime/policy/runtime-policy.js'

/** Alias for the provider's tool input schema type. */
export type ToolInputSchema = ProviderToolInputSchema

/** Pairs a provider-facing tool definition with its runtime implementation. */
export interface BridgedToolDefinition {
  readonly providerTool: ProviderToolDefinition
  readonly runtimeTool: RuntimeToolDefinition
}

const READ_CAPABILITIES = new Set([
  'PLAN',
  'READ',
  'SEARCH',
  'REVIEW',
  'EVIDENCE_READ',
  'POLICY_CHECK',
  'LIVE_READ_CLIENT',
  'OPERATOR_REVIEW',
  'ZFLOW_REPORT',
  'ZFLOW_REPORT_CATALOG',
])

function isToolAllowedByMode(mode: CodemindRuntimeMode, tool: RuntimeToolDefinition): boolean {
  switch (mode) {
    case 'PLAN_ONLY':
      return tool.capability === 'PLAN' || tool.capability === 'READ'
    case 'READ_ONLY':
      return READ_CAPABILITIES.has(tool.capability)
    case 'PROPOSAL_ONLY':
      return (
        READ_CAPABILITIES.has(tool.capability) ||
        tool.capability === 'PROPOSE' ||
        tool.capability === 'DRAFT_NOTES' ||
        tool.capability === 'VALIDATE'
      )
    case 'APPROVED_EXECUTION':
      return true
  }
}

/** Returns the JSON Schema for a tool's input parameters. */
export function buildToolInputSchema(tool: RuntimeToolDefinition): ToolInputSchema {
  const schemaMap: Partial<Record<string, ToolInputSchema>> = {
    plan_goal: {
      type: 'object',
      properties: { goal: { type: 'string', description: 'The goal to plan for' } },
      required: ['goal'],
    },
    list_files: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Directory path to list' },
        recursive: { type: 'boolean', description: 'Whether to list recursively' },
      },
      required: ['path'],
    },
    read_file: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path to read' },
        startLine: { type: 'number', description: 'Line to start reading from' },
        endLine: { type: 'number', description: 'Line to stop reading at' },
      },
      required: ['path'],
    },
    search_files: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Text to search for in files' },
        dir: { type: 'string', description: 'Directory to search in (relative to workspace)' },
        limit: { type: 'number', description: 'Max results to return' },
      },
      required: ['query'],
    },
    propose_edit: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path to edit' },
        oldText: { type: 'string', description: 'Text to find and replace' },
        newText: { type: 'string', description: 'Replacement text' },
      },
      required: ['path', 'oldText', 'newText'],
    },
    edit_file: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path to edit' },
        oldText: { type: 'string', description: 'Exact text to find and replace' },
        newText: { type: 'string', description: 'Replacement text' },
        replaceAll: { type: 'boolean', description: 'Replace all occurrences (default false)' },
      },
      required: ['path', 'oldText', 'newText'],
    },
    validation_plan: {
      type: 'object',
      properties: {
        focus: { type: 'string', description: 'Validation focus area' },
      },
      required: ['focus'],
    },
    glob: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'Glob pattern to match files (e.g. **/*.ts)' },
        cwd: { type: 'string', description: 'Base directory for the search' },
        maxResults: { type: 'number', description: 'Maximum number of results to return' },
      },
      required: ['pattern'],
    },
    grep: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'Regex pattern to search for' },
        path: { type: 'string', description: 'Directory to search in' },
        filePattern: { type: 'string', description: 'Filter to specific file types (e.g. *.ts)' },
        contextLines: { type: 'number', description: 'Lines of context around matches' },
        maxResults: { type: 'number', description: 'Maximum number of matches to return' },
      },
      required: ['pattern'],
    },
    bash: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'Shell command to execute (must be in allowlist)' },
        timeoutMs: { type: 'number', description: 'Timeout in milliseconds (default 120000)' },
      },
      required: ['command'],
    },
    git: {
      type: 'object',
      properties: {
        operation: {
          type: 'string',
          description:
            'Git operation: status, diff, log, branch, show, checkout_new, add, commit, push',
        },
        args: {
          type: 'array',
          items: { type: 'string' },
          description: 'Additional arguments for the git command',
        },
        message: { type: 'string', description: 'Commit message (for commit operation)' },
      },
      required: ['operation'],
    },
    local_file_write: {
      type: 'object',
      properties: {
        targetPath: { type: 'string', description: 'File path to write to' },
        content: { type: 'string', description: 'Content to write' },
        reason: { type: 'string', description: 'Reason for the write' },
        rollbackNote: { type: 'string', description: 'How to rollback this change' },
        dryRun: {
          type: 'boolean',
          description: 'If true, only validate without writing (default true)',
        },
      },
      required: ['targetPath', 'content', 'reason', 'rollbackNote'],
    },
    apply_patch: {
      type: 'object',
      properties: {
        reason: { type: 'string', description: 'Reason for the patch' },
        rollbackNote: { type: 'string', description: 'How to rollback this patch' },
        dryRun: {
          type: 'boolean',
          description: 'If true, only validate without applying (default true)',
        },
        files: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              targetPath: { type: 'string' },
              content: { type: 'string' },
            },
            required: ['targetPath', 'content'],
          },
          description: 'Files to patch',
        },
      },
      required: ['reason', 'rollbackNote', 'files'],
    },
    validation_command_gate: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'Validation command to run (e.g. npm run test)' },
        reason: { type: 'string', description: 'Reason for running this command' },
        dryRun: {
          type: 'boolean',
          description: 'If true, only validate without running (default true)',
        },
      },
      required: ['command', 'reason'],
    },
    pr_preparation: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'PR title' },
        body: { type: 'string', description: 'PR body/description' },
        baseBranch: { type: 'string', description: 'Base branch for the PR' },
      },
      required: ['title', 'body'],
    },
    operator_review_packet: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Packet identifier' },
        proposedAction: {
          type: 'string',
          description:
            'Action to review: post_pr_comment, apply_label, request_review, submit_review, create_pr, merge_pr',
        },
        actionDetail: { type: 'string', description: 'Details of the proposed action' },
        nextManualStep: { type: 'string', description: 'What the operator should do next' },
        sourceEvidence: {
          type: 'array',
          items: { type: 'string' },
          description: 'Evidence supporting this action',
        },
        risks: { type: 'array', items: { type: 'string' }, description: 'Known risks' },
        validation: {
          type: 'array',
          items: { type: 'string' },
          description: 'Validation steps taken',
        },
        boundary: { type: 'array', items: { type: 'string' }, description: 'Boundary conditions' },
      },
      required: ['id', 'proposedAction', 'actionDetail', 'nextManualStep'],
    },
    write_intent_plan: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Intent identifier' },
        target: {
          type: 'string',
          description:
            'Target type: file_edit, file_create, file_delete, github_pr_comment, github_label, github_review, github_pr_create',
        },
        targetPath: { type: 'string', description: 'Path of the target' },
        reason: { type: 'string', description: 'Reason for the write' },
        expectedDiffSummary: { type: 'string', description: 'Expected changes summary' },
        rollbackNote: { type: 'string', description: 'How to rollback' },
        validationPlan: {
          type: 'array',
          items: { type: 'string' },
          description: 'Validation steps',
        },
      },
      required: ['id', 'target', 'targetPath', 'reason', 'expectedDiffSummary', 'rollbackNote'],
    },
    ci_review: {
      type: 'object',
      properties: {
        focus: { type: 'string', description: 'CI review focus area' },
      },
      required: ['focus'],
    },
    pr_notes: {
      type: 'object',
      properties: {
        context: { type: 'string', description: 'Context for PR notes generation' },
      },
      required: ['context'],
    },
    swarm_dispatch: {
      type: 'object',
      properties: {
        agentType: {
          type: 'string',
          description: 'Swarm agent type: investigator, reporter, analyzer, coder, reviewer',
        },
        goal: { type: 'string', description: 'Goal for the swarm agent to accomplish' },
        context: { type: 'string', description: 'Additional context for the agent' },
      },
      required: ['agentType', 'goal'],
    },
    run_tests: {
      type: 'object',
      properties: {},
    },
    run_typecheck: {
      type: 'object',
      properties: {},
    },
    run_lint: {
      type: 'object',
      properties: {},
    },
    pr_collaboration: {
      type: 'object',
      properties: {
        action: { type: 'string', description: 'Collaboration action: post_comment, apply_label' },
        repository: { type: 'string', description: 'Repository (owner/repo)' },
        prNumber: { type: 'number', description: 'Pull request number' },
        content: { type: 'string', description: 'Comment or label content' },
        reason: { type: 'string', description: 'Reason for the action' },
        dryRun: {
          type: 'boolean',
          description: 'If true, only validate without executing (default true)',
        },
      },
      required: ['action', 'repository', 'prNumber', 'content', 'reason'],
    },
    github_create_pr: {
      type: 'object',
      properties: {
        repository: { type: 'string', description: 'Repository (owner/repo)' },
        baseBranch: { type: 'string', description: 'Base branch for the PR' },
        headBranch: { type: 'string', description: 'Head branch for the PR' },
        title: { type: 'string', description: 'PR title' },
        body: { type: 'string', description: 'PR body/description' },
        reason: { type: 'string', description: 'Reason for creating the PR' },
        dryRun: {
          type: 'boolean',
          description: 'If true, only validate without creating (default true)',
        },
        files: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              path: { type: 'string' },
              content: { type: 'string' },
            },
            required: ['path', 'content'],
          },
          description: 'Files to include in the PR',
        },
      },
      required: ['repository', 'baseBranch', 'headBranch', 'title', 'body', 'reason', 'files'],
    },
    github_write_gate: {
      type: 'object',
      properties: {
        action: { type: 'string', description: 'GitHub write action to evaluate' },
        repository: { type: 'string', description: 'Repository (owner/repo)' },
        targetRef: { type: 'string', description: 'Target branch or ref' },
        content: { type: 'string', description: 'Content for the action' },
        reason: { type: 'string', description: 'Reason for the write' },
        dryRun: {
          type: 'boolean',
          description: 'If true, only evaluate without executing (default true)',
        },
      },
      required: ['action', 'repository', 'reason'],
    },
    github_write_proposal: {
      type: 'object',
      properties: {
        action: { type: 'string', description: 'Proposed GitHub write action' },
        repository: { type: 'string', description: 'Repository (owner/repo)' },
        targetRef: { type: 'string', description: 'Target branch or ref' },
        content: { type: 'string', description: 'Content for the action' },
        reason: { type: 'string', description: 'Reason for the proposal' },
      },
      required: ['action', 'repository', 'reason'],
    },
    github_pr_fixture_review: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path to the PR fixture JSON file' },
      },
      required: ['path'],
    },
    github_ci_fixture_review: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path to the CI fixture JSON file' },
      },
      required: ['path'],
    },
    live_read_policy_handshake: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path to the policy handshake JSON fixture' },
      },
      required: ['path'],
    },
    live_read_client_fixture: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path to the live read client fixture JSON file' },
      },
      required: ['path'],
    },
    zflow_report: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Report identifier' },
        format: { type: 'string', description: 'Output format: markdown or json' },
        result: { type: 'object', description: 'Zflow execution result' },
        readiness: { type: 'object', description: 'Zflow readiness summary' },
      },
      required: ['id'],
    },
    zflow_report_rollup: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Rollup title' },
        format: { type: 'string', description: 'Output format: markdown or json' },
        catalog: { type: 'object', description: 'Zflow report catalog' },
        generatedAt: { type: 'string', description: 'Timestamp for the rollup' },
      },
      required: ['title', 'format', 'catalog'],
    },
    zflow_report_catalog: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Catalog title' },
        format: { type: 'string', description: 'Output format: markdown or json' },
        reports: { type: 'array', description: 'Array of Zflow execution reports' },
        generatedAt: { type: 'string', description: 'Timestamp for the catalog' },
      },
      required: ['title', 'format', 'reports'],
    },
    github_live_read_pr: {
      type: 'object',
      properties: {
        owner: { type: 'string', description: 'Repository owner' },
        repo: { type: 'string', description: 'Repository name' },
        prNumber: { type: 'number', description: 'Pull request number' },
      },
      required: ['owner', 'repo', 'prNumber'],
    },
    github_live_read_ci: {
      type: 'object',
      properties: {
        owner: { type: 'string', description: 'Repository owner' },
        repo: { type: 'string', description: 'Repository name' },
        runId: { type: 'number', description: 'GitHub Actions workflow run ID' },
      },
      required: ['owner', 'repo', 'runId'],
    },
    ajna_live_read_review: {
      type: 'object',
      properties: {
        owner: { type: 'string', description: 'Repository owner' },
        repo: { type: 'string', description: 'Repository name' },
        prNumber: { type: 'number', description: 'Pull request number' },
        focus: { type: 'string', description: 'Review focus area' },
      },
      required: ['owner', 'repo', 'prNumber'],
    },
    ajna_live_read_merge_readiness: {
      type: 'object',
      properties: {
        owner: { type: 'string', description: 'Repository owner' },
        repo: { type: 'string', description: 'Repository name' },
        prNumber: { type: 'number', description: 'Pull request number' },
        requireCi: { type: 'boolean', description: 'Whether passing CI is required' },
      },
      required: ['owner', 'repo', 'prNumber'],
    },
  }

  const schema = schemaMap[tool.name]
  if (schema === undefined) {
    throw new Error(
      `Tool "${tool.name}" has no registered input schema in buildToolInputSchema. ` +
        'Every CodemindToolName must have an explicit schema.',
    )
  }
  return schema
}

/** Filters tools by policy mode and bridges them to provider format. */
export function bridgeToolsForProvider(
  tools: readonly RuntimeToolDefinition[],
  policy: RuntimePolicySnapshot,
): readonly BridgedToolDefinition[] {
  assertValidPolicy(policy)
  return tools
    .filter((tool) => isToolAllowedByMode(policy.mode, tool))
    .map((tool) => ({
      providerTool: {
        name: tool.name,
        description: tool.description,
        inputSchema: buildToolInputSchema(tool),
      },
      runtimeTool: tool,
    }))
}

/** Extracts the provider-facing tool definitions from bridged tools. */
export function extractProviderTools(
  bridgedTools: readonly BridgedToolDefinition[],
): readonly ProviderToolDefinition[] {
  return bridgedTools.map((bt) => bt.providerTool)
}
