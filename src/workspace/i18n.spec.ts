import { describe, expect, it } from 'vitest'

import {
  CODEMIND_WORKSPACE_I18N,
  isWorkspaceLocale,
  resolveWorkspaceLocale,
  translateWorkspace,
} from './i18n.js'

describe('workspace i18n', () => {
  it('ships English and Spanish resources for editor controls', () => {
    expect(CODEMIND_WORKSPACE_I18N.en.runButton).toBe('Run')
    expect(CODEMIND_WORKSPACE_I18N.es.runButton).toBe('Ejecutar')
    expect(CODEMIND_WORKSPACE_I18N.es.copyButton).toBe('Copiar código')
  })

  it('resolves supported and fallback locales', () => {
    expect(isWorkspaceLocale('en')).toBe(true)
    expect(isWorkspaceLocale('es')).toBe(true)
    expect(isWorkspaceLocale('fr')).toBe(false)
    expect(resolveWorkspaceLocale('es')).toBe('es')
    expect(resolveWorkspaceLocale('fr')).toBe('en')
  })

  it('translates the editor disabled state separately from programming-language support', () => {
    expect(translateWorkspace('en', 'disabledExecution')).toContain('configured sandbox runner')
    expect(translateWorkspace('es', 'disabledExecution')).toContain('runner sandbox configurado')
  })
})
