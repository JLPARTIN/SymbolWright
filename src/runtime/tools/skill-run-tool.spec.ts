import { describe, expect, it } from 'vitest'

import { buildToolInputSchema } from '../../agent/tool-schema-bridge.js'
import { assembleAgentTools, getToolByName } from './tool-assembly.js'
import { skillRunTool } from './skill-run-tool.js'

describe('skillRunTool', () => {
  it('is registered in the production tool assembly', () => {
    expect(assembleAgentTools().map((tool) => tool.name)).toContain('skill_run')
    expect(getToolByName('skill_run')).toBe(skillRunTool)
  })

  it('has an explicit provider schema', () => {
    const schema = buildToolInputSchema(skillRunTool)
    expect(schema.required).toEqual(['name'])
    expect(schema.properties['name']).toBeDefined()
    expect(schema.properties['enableGovernedTools']).toBeDefined()
  })
})
