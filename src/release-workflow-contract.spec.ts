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
      const workflowContent = readWorkflow(workflow)
      expect(workflowContent).toContain('npm run validate')
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

  it('normalizes GHCR image names before Docker metadata is generated', () => {
    const deploy = readWorkflow('.github/workflows/deploy.yml')

    expect(deploy).toContain('id: image')
    expect(deploy).toContain('name=${GITHUB_REPOSITORY,,}')
    expect(deploy).toContain('>> "$GITHUB_OUTPUT"')
    expect(deploy).toContain('images: ${{ env.REGISTRY }}/${{ steps.image.outputs.name }}')
    expect(deploy).not.toContain('IMAGE_NAME: ${{ github.repository }}')
    expect(deploy.indexOf('Normalize GHCR image name')).toBeLessThan(
      deploy.indexOf('Extract metadata'),
    )
  })
})
