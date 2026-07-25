import type { RepositoryPortabilityProfile } from '../portability/repository-portability.js'
import { runGitCommand } from '../runtime/git/git-command-runner.js'
import { redactValidationOutput } from '../runtime/validation/validation-output-redactor.js'
import type { GitHubOperationsPolicy } from './github-operations-policy.js'

/**
 * Produces the non-destructive PR-preparation path: a local working branch,
 * staged and committed changes, and a fully generated PR title/body/commit
 * message — all real, local git state. This works even when GitHub write
 * operations (push, PR creation) are blocked by policy, because branch
 * creation and local commits are workspace-scoped operations that never
 * touch the real remote repository.
 */

export type PrOperationChangeType = 'added' | 'modified' | 'deleted' | 'renamed'

export interface PrOperationChangedFile {
  readonly path: string
  readonly changeType: PrOperationChangeType
}

export type PrOperationValidationStatus = 'passed' | 'failed' | 'blocked'

export interface PrOperationValidationEvidence {
  readonly command: string
  readonly status: PrOperationValidationStatus
  readonly summary: string
}

export interface PrOperationRepairAttempt {
  readonly attempt: number
  readonly summary: string
  readonly outcome: 'passed' | 'failed'
}

export interface PrOperationPacketInput {
  readonly repositoryRoot: string
  readonly branchName: string
  readonly baseBranch: string
  readonly objective: string
  readonly changedFiles: readonly PrOperationChangedFile[]
  readonly validationEvidence: readonly PrOperationValidationEvidence[]
  readonly portability?: RepositoryPortabilityProfile
  readonly repairAttempts?: readonly PrOperationRepairAttempt[]
  readonly riskFlags?: readonly string[]
  readonly policy: GitHubOperationsPolicy
}

export interface PrOperationPacket {
  readonly branchName: string
  readonly baseBranch: string
  readonly branchCreated: boolean
  readonly stagedFiles: readonly string[]
  readonly commitCreated: boolean
  readonly commitSha?: string
  readonly commitMessage: string
  readonly prTitle: string
  readonly prBody: string
  readonly rollbackNotes: readonly string[]
  readonly readyToPush: boolean
  readonly writesAllowed: boolean
  readonly pullRequestCreationAllowed: boolean
  readonly evidence: readonly string[]
}

function firstLine(value: string): string {
  const trimmed = value.trim()
  const newlineIndex = trimmed.indexOf('\n')
  return (newlineIndex === -1 ? trimmed : trimmed.slice(0, newlineIndex)).trim()
}

function generatePrTitle(input: PrOperationPacketInput): string {
  const objective = firstLine(input.objective)
  return objective.length > 0 ? objective : `Update from SymbolWright mission (${input.branchName})`
}

function generateCommitMessage(input: PrOperationPacketInput, title: string): string {
  const fileCount = input.changedFiles.length
  return `${title}\n\n${fileCount} file(s) changed via SymbolWright autonomous mission.`
}

function generatePrBody(
  input: PrOperationPacketInput,
  stagedFiles: readonly string[],
  commitCreated: boolean,
): string {
  const lines: string[] = ['## Objective', '', input.objective.trim(), '']

  lines.push('## Changed files', '')
  if (input.changedFiles.length === 0) {
    lines.push('- No files were changed.')
  } else {
    for (const file of input.changedFiles) {
      const staged = stagedFiles.includes(file.path)
      lines.push(`- \`${file.path}\` (${file.changeType})${staged ? '' : ' — not staged'}`)
    }
  }
  lines.push('')

  lines.push('## Validation evidence', '')
  if (input.validationEvidence.length === 0) {
    lines.push('- No validation evidence was recorded.')
  } else {
    for (const evidence of input.validationEvidence) {
      const redactedSummary = redactValidationOutput(evidence.summary)
      lines.push(
        `- **${evidence.status.toUpperCase()}**: \`${evidence.command}\` — ${redactedSummary}`,
      )
    }
  }
  lines.push('')

  if (input.portability !== undefined) {
    lines.push(
      '## Repository intelligence',
      '',
      `- Ecosystems: ${input.portability.ecosystems.join(', ')}`,
      `- Mixed repository: ${input.portability.mixed ? 'yes' : 'no'}`,
      `- Detection confidence: ${input.portability.confidence}`,
      `- Validation commands discovered: ${input.portability.validationCommands.length}`,
      '',
    )
  }

  if (input.repairAttempts !== undefined && input.repairAttempts.length > 0) {
    lines.push('## Repair attempts', '')
    for (const attempt of input.repairAttempts) {
      lines.push(
        `- Attempt ${attempt.attempt}: ${attempt.outcome.toUpperCase()} — ${attempt.summary}`,
      )
    }
    lines.push('')
  }

  if (input.riskFlags !== undefined && input.riskFlags.length > 0) {
    lines.push('## Risk flags', '')
    for (const flag of input.riskFlags) lines.push(`- ${flag}`)
    lines.push('')
  }

  lines.push(
    '## Rollback',
    '',
    commitCreated
      ? `To undo locally: \`git checkout ${input.baseBranch} && git branch -D ${input.branchName}\`.`
      : 'No commit was created; nothing to roll back.',
  )

  return lines.join('\n')
}

/**
 * Acquired external workspaces (and CI runners) commonly have no git
 * committer identity configured at any level, which makes `git commit` fail
 * with "Author identity unknown" — not a policy block, just missing setup.
 * Falls back to a SymbolWright bot identity for this commit only (via `-c`,
 * git's highest-precedence override) rather than mutating the repository's
 * config, so a workspace that already has a real identity keeps it.
 */
async function resolveMissingIdentityOverrides(repositoryRoot: string): Promise<string[]> {
  const [email, name] = await Promise.all([
    runGitCommand(['config', 'user.email'], repositoryRoot),
    runGitCommand(['config', 'user.name'], repositoryRoot),
  ])
  const overrides: string[] = []
  if (email.exitCode !== 0 || email.stdout.trim().length === 0) {
    overrides.push('-c', 'user.email=symbolwright-agent@users.noreply.github.com')
  }
  if (name.exitCode !== 0 || name.stdout.trim().length === 0) {
    overrides.push('-c', 'user.name=SymbolWright Agent')
  }
  return overrides
}

/**
 * Creates a local branch, stages and commits the given changed files, and
 * generates a full PR title/body/commit message packet. Never pushes and
 * never calls the GitHub API — see github-operations-adapter.ts for the
 * separately policy-gated remote steps.
 */
export async function preparePrOperationPacket(
  input: PrOperationPacketInput,
): Promise<PrOperationPacket> {
  const evidence: string[] = []
  input.policy.assertAllowed('create_branch')
  input.policy.assertAllowed('commit_changes')

  const checkout = await runGitCommand(['checkout', '-b', input.branchName], input.repositoryRoot)
  const branchCreated = checkout.exitCode === 0
  evidence.push(
    branchCreated
      ? `Created local branch "${input.branchName}".`
      : `Failed to create local branch "${input.branchName}": ${checkout.stderr.trim()}`,
  )

  const stagedFiles: string[] = []
  if (branchCreated) {
    for (const file of input.changedFiles) {
      const add = await runGitCommand(['add', '--', file.path], input.repositoryRoot)
      if (add.exitCode === 0) {
        stagedFiles.push(file.path)
      } else {
        evidence.push(`Failed to stage "${file.path}": ${add.stderr.trim()}`)
      }
    }
  }

  const title = generatePrTitle(input)
  const commitMessage = generateCommitMessage(input, title)

  let commitCreated = false
  let commitSha: string | undefined
  if (branchCreated && stagedFiles.length > 0) {
    const identityOverrides = await resolveMissingIdentityOverrides(input.repositoryRoot)
    const commit = await runGitCommand(
      [...identityOverrides, 'commit', '-m', commitMessage],
      input.repositoryRoot,
    )
    commitCreated = commit.exitCode === 0
    if (commitCreated) {
      const head = await runGitCommand(['rev-parse', 'HEAD'], input.repositoryRoot)
      if (head.exitCode === 0) commitSha = head.stdout.trim()
      evidence.push(`Committed ${stagedFiles.length} file(s) to "${input.branchName}".`)
    } else {
      evidence.push(`Failed to commit staged changes: ${commit.stderr.trim()}`)
    }
  } else if (branchCreated) {
    evidence.push('No files were staged; skipped commit.')
  }

  const prBody = generatePrBody(input, stagedFiles, commitCreated)
  const rollbackNotes = [`git checkout ${input.baseBranch}`, `git branch -D ${input.branchName}`]

  return {
    branchName: input.branchName,
    baseBranch: input.baseBranch,
    branchCreated,
    stagedFiles,
    commitCreated,
    ...(commitSha === undefined ? {} : { commitSha }),
    commitMessage,
    prTitle: title,
    prBody,
    rollbackNotes,
    readyToPush: branchCreated && commitCreated,
    writesAllowed: input.policy.isAllowed('push_branch'),
    pullRequestCreationAllowed: input.policy.isAllowed('open_pull_request'),
    evidence,
  }
}

export function renderPrOperationPacket(packet: PrOperationPacket): string {
  const lines = [
    'SymbolWright PR Operation Packet',
    '',
    `Branch: ${packet.branchName} (from ${packet.baseBranch})`,
    `Branch created: ${packet.branchCreated ? 'yes' : 'no'}`,
    `Staged files: ${packet.stagedFiles.length}`,
    `Commit created: ${packet.commitCreated ? 'yes' : 'no'}`,
  ]
  if (packet.commitSha !== undefined) lines.push(`Commit SHA: ${packet.commitSha}`)
  lines.push(
    `Ready to push: ${packet.readyToPush ? 'yes' : 'no'}`,
    `Push allowed by policy: ${packet.writesAllowed ? 'yes' : 'no'}`,
    `PR creation allowed by policy: ${packet.pullRequestCreationAllowed ? 'yes' : 'no'}`,
    '',
    `PR title: ${packet.prTitle}`,
    '',
    'PR body:',
    packet.prBody,
    '',
    'Rollback notes:',
    ...packet.rollbackNotes.map((note) => `  ${note}`),
  )
  return lines.join('\n')
}
