import path from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  encodePortableValidationInvocation,
  parsePortableValidationInvocation,
  resolvePortableValidationRoot,
} from './portable-validation-invocation.js'

describe('portable validation invocation', () => {
  it('keeps root commands unchanged and encodes nested package roots', () => {
    expect(
      encodePortableValidationInvocation({ command: 'npm run lint', workingDirectory: '.' }),
    ).toBe('npm run lint')
    expect(
      encodePortableValidationInvocation({
        command: 'python -m pytest',
        workingDirectory: 'services/api',
      }),
    ).toBe('codemind-cwd:services/api::python -m pytest')
    expect(
      parsePortableValidationInvocation('codemind-cwd:services/api::python -m pytest'),
    ).toEqual({
      command: 'python -m pytest',
      workingDirectory: 'services/api',
    })
  })

  it('resolves nested roots inside the repository and blocks traversal', () => {
    const root = path.resolve('/tmp/codemind-portable-root')
    expect(resolvePortableValidationRoot(root, 'services/api')).toBe(
      path.join(root, 'services/api'),
    )
    expect(() => resolvePortableValidationRoot(root, '../outside')).toThrow(
      'Unsafe portable validation working directory',
    )
    expect(() => parsePortableValidationInvocation('codemind-cwd:services/api')).toThrow(
      'malformed',
    )
  })
})
