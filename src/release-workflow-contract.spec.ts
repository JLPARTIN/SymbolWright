import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const WORKSPACE = path.resolve(import.meta.dirname, '..')

function readWorkflow(relativePath: string): string {
  return fs.readFileSync(path.join(WORKSPACE, relativePath), 'utf8')
}

describe('release workflow proof gates', () => {
  it('runs the shared validate gate in CI, deploy, and publish workflows', () => {
    const workflows = [
      '.github/workflows/ci.yml',
      '.github/workflows/deploy.yml',
      '.github/workflows/publish.yml',
    ]

    for (const workflow of workflows) {
      expect(readWorkflow(workflow), workflow).toContain('npm run validate')
    }
  })

  it('keeps publish protected by validation and npm dry-run proof', () => {
    const publish = readWorkflow('.github/workflows/publish.yml')

    expect(publish).toContain('needs: validate')
    expect(publish).toContain('npm run validate')
    expect(publish).toContain('npm publish --dry-run')
    expect(publish).toContain('npm publish --provenance --access public')
  })

  it('keeps deploy protected by validation before container publish', () => {
    const deploy = readWorkflow('.github/workflows/deploy.yml')

    expect(deploy).toContain('npm run validate')
    expect(deploy).toContain('docker/build-push-action')
    expect(deploy).toContain('push: true')
  })
})
