import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  createOperatorReviewPacket,
  renderOperatorReviewPacket,
  type OperatorReviewAction,
} from './operator-review-packet.js'

import {
  evaluateOperatorReviewGate,
  renderOperatorReviewGateResult,
} from './operator-review-gate.js'

import { operatorReviewPacketTool } from '../tools/operator-review-packet-tool.js'
import { createOperatorReviewRuntimeRegistry } from '../runtime-operator-review-registry.js'
import type { RuntimeToolContext } from '../types.js'
import { renderRuntimeOperatorReview } from '../../cli-runtime-operator-review.js'

const testContext: RuntimeToolContext = {
  cwd: '/test',
  policy: {
    mode: 'READ_ONLY',
    allowNetwork: false,
    allowShell: false,
    allowWrites: false,
    allowGitHubWrites: false,
    protectedPaths: [],
    noisyDirs: [],
  },
}

function makePacketInput(
  overrides: Partial<{
    id: string
    sourceEvidence: readonly string[]
    proposedAction: OperatorReviewAction
    actionDetail: string
    risks: readonly string[]
    validation: readonly string[]
    boundary: readonly string[]
    nextManualStep: string
  }> = {},
) {
  return {
    id: overrides.id ?? 'PKT-001',
    sourceEvidence: overrides.sourceEvidence ?? ['PR #42 review evidence', 'CI workflow passed'],
    proposedAction: overrides.proposedAction ?? ('post_pr_comment' as OperatorReviewAction),
    actionDetail: overrides.actionDetail ?? 'Post a summary comment on PR #42',
    risks: overrides.risks ?? ['Comment will be visible to all repo collaborators'],
    validation: overrides.validation ?? ['Review evidence is complete', 'CI is green'],
    boundary: overrides.boundary ?? ['no merge', 'no approval', 'no label change'],
    nextManualStep:
      overrides.nextManualStep ?? 'Operator confirms comment text and approves posting',
  }
}

describe('operator review packet', () => {
  it('creates a packet with all required fields', () => {
    const input = makePacketInput()
    const packet = createOperatorReviewPacket(input)

    expect(packet.id).toBe('PKT-001')
    expect(packet.proposedAction).toBe('post_pr_comment')
    expect(packet.actionDetail).toBe('Post a summary comment on PR #42')
    expect(packet.sourceEvidence).toEqual(['PR #42 review evidence', 'CI workflow passed'])
    expect(packet.risks).toEqual(['Comment will be visible to all repo collaborators'])
    expect(packet.validation).toEqual(['Review evidence is complete', 'CI is green'])
    expect(packet.boundary).toEqual(['no merge', 'no approval', 'no label change'])
    expect(packet.nextManualStep).toBe('Operator confirms comment text and approves posting')
    expect(packet.timestamp).toBeDefined()
  })

  it('renders a packet with all sections', () => {
    const packet = createOperatorReviewPacket(makePacketInput())
    const output = renderOperatorReviewPacket(packet)

    expect(output).toContain('CodeMind operator review packet')
    expect(output).toContain('Packet ID: PKT-001')
    expect(output).toContain('Proposed action: post_pr_comment')
    expect(output).toContain('Detail: Post a summary comment on PR #42')
    expect(output).toContain('Source evidence:')
    expect(output).toContain('- PR #42 review evidence')
    expect(output).toContain('Risks:')
    expect(output).toContain('Validation:')
    expect(output).toContain('Boundary:')
    expect(output).toContain('Next manual step:')
    expect(output).toContain('PENDING_OPERATOR_REVIEW')
    expect(output).toContain('requires operator confirmation')
  })

  it('renders a packet with empty optional arrays', () => {
    const packet = createOperatorReviewPacket(
      makePacketInput({
        sourceEvidence: [],
        risks: [],
        validation: [],
        boundary: [],
      }),
    )
    const output = renderOperatorReviewPacket(packet)

    expect(output).toContain('CodeMind operator review packet')
    expect(output).not.toContain('Source evidence:')
    expect(output).not.toContain('Risks:')
    expect(output).not.toContain('Validation:')
    expect(output).not.toContain('Boundary:')
  })
})

describe('operator review gate', () => {
  it('returns PENDING for allowed actions', () => {
    const allowedActions: OperatorReviewAction[] = [
      'post_pr_comment',
      'apply_label',
      'request_review',
      'submit_review',
      'create_pr',
    ]

    for (const action of allowedActions) {
      const packet = createOperatorReviewPacket(makePacketInput({ proposedAction: action }))
      const result = evaluateOperatorReviewGate(packet)

      expect(result.decision).toBe('PENDING')
      expect(result.action).toBe(action)
      expect(result.reason).toContain('Operator review required')
    }
  })

  it('returns REJECTED for merge_pr', () => {
    const packet = createOperatorReviewPacket(makePacketInput({ proposedAction: 'merge_pr' }))
    const result = evaluateOperatorReviewGate(packet)

    expect(result.decision).toBe('REJECTED')
    expect(result.action).toBe('merge_pr')
    expect(result.reason).toContain('blocked by current policy')
  })

  it('renders PENDING gate result', () => {
    const packet = createOperatorReviewPacket(makePacketInput())
    const result = evaluateOperatorReviewGate(packet)
    const output = renderOperatorReviewGateResult(result)

    expect(output).toContain('CodeMind operator review gate')
    expect(output).toContain('Decision: PENDING')
    expect(output).toContain('No automatic approval is granted')
    expect(output).toContain('Operator must review')
  })

  it('renders REJECTED gate result', () => {
    const packet = createOperatorReviewPacket(makePacketInput({ proposedAction: 'merge_pr' }))
    const result = evaluateOperatorReviewGate(packet)
    const output = renderOperatorReviewGateResult(result)

    expect(output).toContain('Decision: REJECTED')
    expect(output).toContain('blocked by policy')
  })
})

describe('operator review packet tool', () => {
  it('has correct tool metadata', () => {
    expect(operatorReviewPacketTool.name).toBe('operator_review_packet')
    expect(operatorReviewPacketTool.capability).toBe('OPERATOR_REVIEW')
  })

  it('executes with valid input and returns combined output', async () => {
    const input = makePacketInput()
    const output = await operatorReviewPacketTool.execute(input, testContext)

    expect(output).toContain('CodeMind operator review packet')
    expect(output).toContain('CodeMind operator review gate')
    expect(output).toContain('Packet ID: PKT-001')
    expect(output).toContain('Decision: PENDING')
  })

  it('rejects missing input', async () => {
    await expect(operatorReviewPacketTool.execute(null, testContext)).rejects.toThrow(
      'Missing operator review packet input',
    )
  })

  it('rejects missing id', async () => {
    await expect(
      operatorReviewPacketTool.execute({ ...makePacketInput(), id: '' }, testContext),
    ).rejects.toThrow('Missing packet id')
  })

  it('rejects invalid proposedAction', async () => {
    await expect(
      operatorReviewPacketTool.execute(
        { ...makePacketInput(), proposedAction: 'invalid' },
        testContext,
      ),
    ).rejects.toThrow('Invalid proposedAction')
  })

  it('rejects missing actionDetail', async () => {
    await expect(
      operatorReviewPacketTool.execute({ ...makePacketInput(), actionDetail: '' }, testContext),
    ).rejects.toThrow('Missing actionDetail')
  })

  it('rejects missing nextManualStep', async () => {
    await expect(
      operatorReviewPacketTool.execute({ ...makePacketInput(), nextManualStep: '' }, testContext),
    ).rejects.toThrow('Missing nextManualStep')
  })

  it('shows REJECTED for merge_pr', async () => {
    const input = makePacketInput({ proposedAction: 'merge_pr' })
    const output = await operatorReviewPacketTool.execute(input, testContext)

    expect(output).toContain('Decision: REJECTED')
    expect(output).toContain('blocked by current policy')
  })
})

describe('operator review registry', () => {
  it('includes operator_review_packet tool', () => {
    const registry = createOperatorReviewRuntimeRegistry({})

    expect(registry.has('operator_review_packet')).toBe(true)
    const tool = registry.getOrThrow('operator_review_packet')
    expect(tool.name).toBe('operator_review_packet')
  })

  it('inherits all Phase I tools', () => {
    const registry = createOperatorReviewRuntimeRegistry({})

    expect(registry.has('ajna_live_read_review')).toBe(true)
    expect(registry.has('ajna_live_read_merge_readiness')).toBe(true)
    expect(registry.has('github_live_read_pr')).toBe(true)
    expect(registry.has('github_live_read_ci')).toBe(true)
    expect(registry.has('live_read_policy_handshake')).toBe(true)
  })
})

describe('CLI operator review', () => {
  it('renders operator review from fixture file', async () => {
    const fixture = {
      id: 'PKT-CLI-001',
      sourceEvidence: ['PR #10 evidence'],
      proposedAction: 'apply_label',
      actionDetail: 'Apply "reviewed" label to PR #10',
      risks: ['Label visible to collaborators'],
      validation: ['Evidence reviewed'],
      boundary: ['no merge'],
      nextManualStep: 'Operator approves label application',
    }

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'operator-review-'))
    const fixturePath = path.join(tmpDir, 'review-fixture.json')
    fs.writeFileSync(fixturePath, JSON.stringify(fixture))

    const output = await renderRuntimeOperatorReview(fixturePath, tmpDir)

    expect(output).toContain('CodeMind operator review packet')
    expect(output).toContain('Packet ID: PKT-CLI-001')
    expect(output).toContain('Proposed action: apply_label')
    expect(output).toContain('CodeMind operator review gate')
    expect(output).toContain('Decision: PENDING')

    fs.rmSync(tmpDir, { recursive: true })
  })

  it('renders REJECTED for merge_pr fixture', async () => {
    const fixture = {
      id: 'PKT-CLI-002',
      sourceEvidence: ['PR #99 evidence'],
      proposedAction: 'merge_pr',
      actionDetail: 'Merge PR #99',
      risks: ['Irreversible merge'],
      validation: ['All checks pass'],
      boundary: ['final merge'],
      nextManualStep: 'N/A — blocked',
    }

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'operator-review-'))
    const fixturePath = path.join(tmpDir, 'review-fixture.json')
    fs.writeFileSync(fixturePath, JSON.stringify(fixture))

    const output = await renderRuntimeOperatorReview(fixturePath, tmpDir)

    expect(output).toContain('Decision: REJECTED')
    expect(output).toContain('blocked by current policy')

    fs.rmSync(tmpDir, { recursive: true })
  })

  it('throws on missing id', async () => {
    const fixture = { proposedAction: 'apply_label', actionDetail: 'test', nextManualStep: 'test' }

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'operator-review-'))
    const fixturePath = path.join(tmpDir, 'bad-fixture.json')
    fs.writeFileSync(fixturePath, JSON.stringify(fixture))

    await expect(renderRuntimeOperatorReview(fixturePath, tmpDir)).rejects.toThrow('non-empty "id"')

    fs.rmSync(tmpDir, { recursive: true })
  })
})
