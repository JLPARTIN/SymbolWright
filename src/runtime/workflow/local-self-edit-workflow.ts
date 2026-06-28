import type { RuntimeApproval, RuntimePolicySnapshot } from '../types.js'
import {
  runRuntimeWorkflow,
  renderWorkflowResult,
  type RuntimeWorkflowResult,
} from './runtime-workflow.js'
import {
  createFixtureContext,
  createFixtureRegistry,
} from '../registry/fixture-registry-factory.js'
import type { PatchFileChange } from '../patch/patch-application.js'

export type LocalSelfEditMode = 'preview-only' | 'apply-only' | 'apply-and-validate'

export interface LocalSelfEditRequest {
  readonly name: string
  readonly mode: LocalSelfEditMode
  readonly reason: string
  readonly rollbackNote: string
  readonly files: readonly PatchFileChange[]
  readonly validationCommand?: string
  readonly policy?: RuntimePolicySnapshot
  readonly approval?: RuntimeApproval
}

export interface LocalSelfEditResult {
  readonly mode: LocalSelfEditMode
  readonly workflow: RuntimeWorkflowResult
}

type LocalSelfEditWorkflowStep =
  | {
      readonly toolName: 'apply_patch'
      readonly input: {
        readonly reason: string
        readonly rollbackNote: string
        readonly dryRun: boolean
        readonly files: readonly PatchFileChange[]
      }
    }
  | {
      readonly toolName: 'validation_command_gate'
      readonly input: {
        readonly command: string
        readonly reason: string
        readonly dryRun: boolean
      }
    }

export async function runLocalSelfEditWorkflow(
  request: LocalSelfEditRequest,
  cwd: string = process.cwd(),
): Promise<LocalSelfEditResult> {
  const registry = createFixtureRegistry('local_self_edit')
  const baseContext = createFixtureContext(cwd)
  const context = {
    ...baseContext,
    ...(request.policy !== undefined ? { policy: request.policy } : {}),
    ...(request.approval !== undefined ? { approval: request.approval } : {}),
  }

  const applyDryRun = request.mode === 'preview-only'
  const steps: LocalSelfEditWorkflowStep[] = [
    {
      toolName: 'apply_patch',
      input: {
        reason: request.reason,
        rollbackNote: request.rollbackNote,
        dryRun: applyDryRun,
        files: request.files,
      },
    },
  ]

  if (request.mode === 'apply-and-validate') {
    steps.push({
      toolName: 'validation_command_gate',
      input: {
        command: request.validationCommand ?? 'npm run typecheck',
        reason: `Validate local self-edit workflow: ${request.reason}`,
        dryRun: false,
      },
    })
  }

  const workflow = await runRuntimeWorkflow(
    {
      name: request.name,
      steps,
      maxSteps: 3,
    },
    registry,
    context,
  )

  return {
    mode: request.mode,
    workflow,
  }
}

export function renderLocalSelfEditResult(result: LocalSelfEditResult): string {
  return [
    'CodeMind local self-edit workflow',
    '',
    `Mode: ${result.mode}`,
    '',
    renderWorkflowResult(result.workflow),
    '',
    'Boundary:',
    '- uses existing apply_patch and validation command gates',
    '- no GitHub writes',
    '- no branch or PR creation',
  ].join('\n')
}
