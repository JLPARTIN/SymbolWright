import fs from 'node:fs'

import type { GitHubCiEvidence } from '../adapters/github-ci-read-adapter.js'
import type { GitHubPrEvidence } from '../adapters/github-pr-read-adapter.js'
import { bridgeRuntimeEvidenceToAjna } from '../ajna/runtime-ajna-evidence-bridge.js'
import { buildCiEvidenceSummary } from '../evidence/ci-evidence-summary.js'
import { buildPrEvidenceSummary } from '../evidence/pr-evidence-builder.js'

import { FakeLiveReadClient, type FakeLiveReadClientData } from './fake-live-read-client.js'
import type { RepositoryFileResult } from './runtime-live-read-client.js'

export interface LiveReadClientFixtureRequest {
  readonly owner: string
  readonly repo: string
  readonly prNumber?: number
  readonly workflowRunId?: number
  readonly filePath?: string
  readonly fileRef?: string
  readonly clientData: FakeLiveReadClientData
}

export function readLiveReadClientFixtureFromFile(path: string): LiveReadClientFixtureRequest {
  return JSON.parse(fs.readFileSync(path, 'utf8')) as LiveReadClientFixtureRequest
}

export async function runLiveReadClientFixture(request: LiveReadClientFixtureRequest): Promise<string> {
  const client = new FakeLiveReadClient(request.clientData)

  const sections: string[] = [
    'CodeMind live read client fixture',
    '',
    `Provider: ${client.provider}`,
    `Repository: ${request.owner}/${request.repo}`,
  ]

  let prEvidence: GitHubPrEvidence | undefined
  let ciEvidence: GitHubCiEvidence | undefined

  if (request.prNumber !== undefined) {
    prEvidence = await client.getPullRequestEvidence(request.owner, request.repo, request.prNumber)
    const summary = buildPrEvidenceSummary(prEvidence)
    sections.push('', summary.title)
    sections.push(...summary.lines.map((line) => `- ${line}`))
  }

  if (request.workflowRunId !== undefined) {
    ciEvidence = await client.getWorkflowEvidence(request.owner, request.repo, request.workflowRunId)
    const summary = buildCiEvidenceSummary(ciEvidence)
    sections.push('', summary.title)
    sections.push(...summary.lines.map((line) => `- ${line}`))
  }

  let fileResult: RepositoryFileResult | undefined
  if (request.filePath !== undefined) {
    fileResult = await client.getRepositoryFile(
      request.owner,
      request.repo,
      request.filePath,
      request.fileRef ?? 'main',
    )
    sections.push('', `File: ${fileResult.path} (ref: ${fileResult.ref})`)
    sections.push(`Content length: ${fileResult.content.length} chars`)
  }

  if (prEvidence !== undefined || ciEvidence !== undefined) {
    const prSummary = prEvidence !== undefined ? buildPrEvidenceSummary(prEvidence) : undefined
    const ciSummary = ciEvidence !== undefined ? buildCiEvidenceSummary(ciEvidence) : undefined

    const bridgeInput = {
      ...(prSummary !== undefined ? { pr: prSummary } : {}),
      ...(ciSummary !== undefined ? { ci: ciSummary } : {}),
    }

    const ajna = bridgeRuntimeEvidenceToAjna(bridgeInput)
    sections.push('', `Ajna bridge verdict: ${ajna.verdict}`)
  }

  sections.push(
    '',
    'Boundary:',
    '- fake client only',
    '- no live service call',
    '- no comments are posted',
    '- no approvals are submitted',
    '- no merges are performed',
    '- no branches are pushed',
    '- no workflow reruns are requested',
  )

  return sections.join('\n')
}
