export const SYMBOLWRIGHT_WORKSPACE_LOCALES = ['en', 'es'] as const

export type WorkspaceLocale = (typeof SYMBOLWRIGHT_WORKSPACE_LOCALES)[number]

export const SYMBOLWRIGHT_WORKSPACE_TRANSLATION_KEYS = [
  'title',
  'subtitle',
  'languageLabel',
  'localeLabel',
  'runButton',
  'previewButton',
  'copyButton',
  'resetButton',
  'clearButton',
  'outputTitle',
  'errorsTitle',
  'diagnosticsTitle',
  'extensionLabel',
  'capabilityLabel',
  'disabledExecution',
  'aiTasksTitle',
  'generateTask',
  'explainTask',
  'translateTask',
  'reviewTask',
  'testsTask',
  'driftTask',
] as const

export type WorkspaceTranslationKey = (typeof SYMBOLWRIGHT_WORKSPACE_TRANSLATION_KEYS)[number]
export type WorkspaceTranslations = Record<WorkspaceTranslationKey, string>

export const SYMBOLWRIGHT_WORKSPACE_I18N: Record<WorkspaceLocale, WorkspaceTranslations> = {
  en: {
    title: 'Universal Polyglot Workspace',
    subtitle: 'Edit, inspect, preview, and run only the languages with real registered runners.',
    languageLabel: 'Programming language',
    localeLabel: 'UI language',
    runButton: 'Run',
    previewButton: 'Preview',
    copyButton: 'Copy code',
    resetButton: 'Reset example',
    clearButton: 'Clear output',
    outputTitle: 'Output',
    errorsTitle: 'Errors',
    diagnosticsTitle: 'Diagnostics',
    extensionLabel: 'File extension',
    capabilityLabel: 'Capability',
    disabledExecution:
      'This language currently supports editing, syntax highlighting, and AI assistance. Execution requires a configured sandbox runner.',
    aiTasksTitle: 'Code intelligence tasks',
    generateTask: 'Generate code',
    explainTask: 'Explain code',
    translateTask: 'Translate code',
    reviewTask: 'Review for bugs',
    testsTask: 'Propose tests',
    driftTask: 'Compare semantic drift',
  },
  es: {
    title: 'Espacio de trabajo políglota universal',
    subtitle:
      'Edita, inspecciona, previsualiza y ejecuta solo los lenguajes con runners reales registrados.',
    languageLabel: 'Lenguaje de programación',
    localeLabel: 'Idioma de la interfaz',
    runButton: 'Ejecutar',
    previewButton: 'Previsualizar',
    copyButton: 'Copiar código',
    resetButton: 'Restablecer ejemplo',
    clearButton: 'Limpiar salida',
    outputTitle: 'Salida',
    errorsTitle: 'Errores',
    diagnosticsTitle: 'Diagnósticos',
    extensionLabel: 'Extensión de archivo',
    capabilityLabel: 'Capacidad',
    disabledExecution:
      'Este lenguaje actualmente admite edición, resaltado de sintaxis y asistencia de IA. La ejecución requiere un runner sandbox configurado.',
    aiTasksTitle: 'Tareas de inteligencia de código',
    generateTask: 'Generar código',
    explainTask: 'Explicar código',
    translateTask: 'Traducir código',
    reviewTask: 'Revisar errores',
    testsTask: 'Proponer pruebas',
    driftTask: 'Comparar deriva semántica',
  },
}

export function isWorkspaceLocale(value: string): value is WorkspaceLocale {
  return SYMBOLWRIGHT_WORKSPACE_LOCALES.some((locale) => locale === value)
}

export function translateWorkspace(locale: WorkspaceLocale, key: WorkspaceTranslationKey): string {
  return SYMBOLWRIGHT_WORKSPACE_I18N[locale][key]
}

export function resolveWorkspaceLocale(value: string | undefined): WorkspaceLocale {
  if (value !== undefined && isWorkspaceLocale(value)) {
    return value
  }

  return 'en'
}
