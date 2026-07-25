import { describe, expect, it } from 'vitest'

import type { RuntimeToolDefinition } from '../types.js'
import { createDefaultRuntimePolicy } from '../policy/runtime-policy.js'
import { createRuntimeRegistry, RuntimeRegistry } from './runtime-registry.js'

const validationEntry: RuntimeToolDefinition = {
  name: 'validation_plan',
  description: 'Render validation guidance.',
  capability: 'VALIDATE',
  execute: async () => 'validation plan',
}

const readEntry: RuntimeToolDefinition = {
  name: 'read_file',
  description: 'Read file content.',
  capability: 'READ',
  execute: async () => 'file content',
}

describe('RuntimeRegistry', () => {
  it('registers and retrieves runtime entries', async () => {
    const registry = createRuntimeRegistry([validationEntry])
    const entry = registry.getOrThrow('validation_plan')

    await expect(
      entry.execute({}, { cwd: '/workspace/symbolwright', policy: createDefaultRuntimePolicy() }),
    ).resolves.toBe('validation plan')
    expect(registry.has('validation_plan')).toBe(true)
  })

  it('lists entries in registration order', () => {
    const registry = createRuntimeRegistry([validationEntry, readEntry])

    expect(registry.list().map((entry) => entry.name)).toEqual(['validation_plan', 'read_file'])
  })

  it('rejects duplicate runtime entry names', () => {
    const registry = new RuntimeRegistry()

    registry.add(validationEntry)

    expect(() => registry.add(validationEntry)).toThrow(
      'Runtime entry already exists: validation_plan',
    )
  })

  it('reports missing entries clearly', () => {
    const registry = new RuntimeRegistry()

    expect(registry.get('read_file')).toBeUndefined()
    expect(() => registry.getOrThrow('read_file')).toThrow('Runtime entry is missing: read_file')
  })
})
