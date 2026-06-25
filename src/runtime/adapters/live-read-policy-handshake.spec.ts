import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import type { LiveReadPolicyRequest } from '../policy/live-read-policy.js'

import {
  readLiveReadPolicyRequestFromFile,
  renderLiveReadPolicyHandshake,
  runLiveReadPolicyHandshake,
} from './live-read-policy-handshake.js'

function writeFixture(request: LiveReadPolicyRequest): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codemind-policy-'))
  const filePath = path.join(dir, 'request.json')
  fs.writeFileSync(filePath, JSON.stringify(request))
  return filePath
}

const validRequest: LiveReadPolicyRequest = {
  provider: 'github',
  purpose: 'review pull request evidence',
  scopes: ['pr:read', 'checks:read', 'contents:read'],
  dryRun: true,
}

describe('readLiveReadPolicyRequestFromFile', () => {
  it('parses a valid fixture file', () => {
    const filePath = writeFixture(validRequest)
    const parsed = readLiveReadPolicyRequestFromFile(filePath)

    expect(parsed.provider).toBe('github')
    expect(parsed.purpose).toBe('review pull request evidence')
    expect(parsed.scopes).toEqual(['pr:read', 'checks:read', 'contents:read'])
    expect(parsed.dryRun).toBe(true)
  })
})

describe('runLiveReadPolicyHandshake', () => {
  it('returns allow decision for valid request', () => {
    const result = runLiveReadPolicyHandshake(validRequest)

    expect(result.request).toEqual(validRequest)
    expect(result.decision.allowed).toBe(true)
  })

  it('returns block decision for invalid request', () => {
    const result = runLiveReadPolicyHandshake({ ...validRequest, dryRun: false })

    expect(result.decision.allowed).toBe(false)
    expect(result.decision.reason).toContain('dryRun=true')
  })
})

describe('renderLiveReadPolicyHandshake', () => {
  it('renders allow output matching expected format', () => {
    const result = runLiveReadPolicyHandshake(validRequest)
    const output = renderLiveReadPolicyHandshake(result)

    expect(output).toContain('CodeMind live read policy handshake')
    expect(output).toContain('Provider: github')
    expect(output).toContain('Purpose: review pull request evidence')
    expect(output).toContain('Dry run: yes')
    expect(output).toContain('Decision: ALLOW')
    expect(output).toContain('Reason: live read policy handshake accepted for dry-run planning')
    expect(output).toContain('- pr:read')
    expect(output).toContain('- checks:read')
    expect(output).toContain('- contents:read')
    expect(output).toContain('Boundary:')
    expect(output).toContain('- read-only adapter handshake only')
    expect(output).toContain('- no service call is performed')
  })

  it('renders block output for disallowed scopes', () => {
    const result = runLiveReadPolicyHandshake({ ...validRequest, scopes: ['pr:write'] })
    const output = renderLiveReadPolicyHandshake(result)

    expect(output).toContain('Decision: BLOCK')
    expect(output).toContain('disallowed scopes: pr:write')
  })

  it('renders block output when dryRun is false', () => {
    const result = runLiveReadPolicyHandshake({ ...validRequest, dryRun: false })
    const output = renderLiveReadPolicyHandshake(result)

    expect(output).toContain('Dry run: no')
    expect(output).toContain('Decision: BLOCK')
  })

  it('integrates from file to render', () => {
    const filePath = writeFixture(validRequest)
    const request = readLiveReadPolicyRequestFromFile(filePath)
    const result = runLiveReadPolicyHandshake(request)
    const output = renderLiveReadPolicyHandshake(result)

    expect(output).toContain('Decision: ALLOW')
    expect(output).toContain('Provider: github')
  })
})
