import { describe, expect, it } from 'vitest'

import {
  CODE_RUNNER_DEFINITIONS,
  UNIVERSAL_LANGUAGE_REGISTRY,
  assertExecutableLanguagesHaveRunners,
  findLanguageDefinition,
  isExecutableCapability,
  listEditOnlyLanguages,
  listExecutableLanguages,
} from './language-registry.js'

describe('UNIVERSAL_LANGUAGE_REGISTRY', () => {
  it('contains broad programming-language coverage with honest capability declarations', () => {
    const ids = UNIVERSAL_LANGUAGE_REGISTRY.map((language) => language.id)

    expect(ids).toEqual(
      expect.arrayContaining([
        'javascript',
        'typescript',
        'python',
        'ruby',
        'r',
        'sql',
        'html',
        'css',
        'java',
        'go',
        'rust',
        'cpp',
        'csharp',
        'php',
        'kotlin',
        'swift',
        'dart',
        'json',
        'yaml',
        'markdown',
        'shell',
        'lua',
        'perl',
        'scala',
        'haskell',
        'ocaml',
        'fortran',
      ]),
    )
  })

  it('marks every executable or preview language with a registered real runner', () => {
    expect(() => assertExecutableLanguagesHaveRunners()).not.toThrow()

    const runnerIds = new Set(CODE_RUNNER_DEFINITIONS.map((runner) => runner.id))
    for (const language of UNIVERSAL_LANGUAGE_REGISTRY) {
      if (isExecutableCapability(language.capability)) {
        const runnerId = language.runnerId
        expect(runnerId, `${language.id} must declare a runner`).toBeDefined()
        expect(
          runnerId === undefined ? false : runnerIds.has(runnerId),
          `${language.id} runner must be registered`,
        ).toBe(true)
      }
    }
  })

  it('does not fake execution for languages without real configured runners', () => {
    const editOnlyIds = listEditOnlyLanguages().map((language) => language.id)

    expect(editOnlyIds).toEqual(
      expect.arrayContaining(['python', 'ruby', 'r', 'sql', 'java', 'go', 'rust', 'cpp', 'csharp']),
    )

    for (const id of ['python', 'ruby', 'r', 'java', 'go', 'rust', 'cpp', 'csharp']) {
      expect(findLanguageDefinition(id)?.runnerId).toBeUndefined()
    }
  })

  it('surfaces only true runnable/previewable languages as executable', () => {
    expect(listExecutableLanguages().map((language) => language.id)).toEqual([
      'javascript',
      'typescript',
      'html',
    ])
  })

  it('stores coverage, snippets, extensions, editor ids, and safety notes for every entry', () => {
    for (const language of UNIVERSAL_LANGUAGE_REGISTRY) {
      expect(language.label.length).toBeGreaterThan(0)
      expect(language.editorLanguageId.length).toBeGreaterThan(0)
      expect(language.extensions.length).toBeGreaterThan(0)
      expect(language.defaultSnippet.length).toBeGreaterThan(0)
      expect(language.safetyRestrictions.length).toBeGreaterThan(0)
      expect(language.testCoverage.length).toBeGreaterThan(0)
    }
  })
})
