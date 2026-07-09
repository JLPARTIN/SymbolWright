export const CODE_LANGUAGE_CAPABILITIES = [
  'browser-run',
  'server-run',
  'edit-only',
  'preview-only',
  'data-viewer',
  'not-yet-supported',
] as const

export type CodeLanguageCapability = (typeof CODE_LANGUAGE_CAPABILITIES)[number]

export const CODE_RUNNER_IDS = [
  'browser-javascript',
  'server-typescript-node',
  'html-preview',
] as const
export type CodeRunnerId = (typeof CODE_RUNNER_IDS)[number]

export type CodeSupportStatus = 'native' | 'syntax-highlighted' | 'plain-text' | 'not-wired'
export type ToolAvailability = 'available' | 'not-configured' | 'not-applicable'

export type CodeLanguageDefinition = {
  id: string
  label: string
  editorLanguageId: string
  extensions: string[]
  capability: CodeLanguageCapability
  runnerId?: CodeRunnerId
  defaultSnippet: string
  formatter: ToolAvailability
  linter: ToolAvailability
  autocomplete: CodeSupportStatus
  syntax: CodeSupportStatus
  safetyRestrictions: string[]
  testCoverage: string
  notes?: string
}

export type CodeRunnerDefinition = {
  id: CodeRunnerId
  label: string
  capability: Extract<CodeLanguageCapability, 'browser-run' | 'server-run' | 'preview-only'>
  safetyRestrictions: string[]
  notes: string
}

type LanguageSeed = {
  id: string
  label: string
  editorLanguageId?: string
  extensions: string[]
  defaultSnippet: string
  notes?: string
}

export const CODE_RUNNER_DEFINITIONS: readonly CodeRunnerDefinition[] = [
  {
    id: 'browser-javascript',
    label: 'Browser JavaScript Worker',
    capability: 'browser-run',
    safetyRestrictions: [
      'Runs in a browser Worker, not the main UI thread.',
      'No DOM access from the Worker runtime.',
      'Network APIs are blocked by the generated Worker wrapper.',
      'Execution is terminated after a short timeout.',
    ],
    notes: 'Used only for JavaScript snippets that can safely execute in the browser.',
  },
  {
    id: 'server-typescript-node',
    label: 'Guarded TypeScript Node VM',
    capability: 'server-run',
    safetyRestrictions: [
      'Creates a temporary workspace for each run.',
      'Compiles with the installed TypeScript compiler before execution.',
      'Runs compiled JavaScript inside a Node vm context with require, process, Buffer, and fetch removed.',
      'Enforces timeout and output-size limits.',
    ],
    notes: 'Requires the repository TypeScript dependency installed in the active workspace.',
  },
  {
    id: 'html-preview',
    label: 'Sandboxed HTML Preview',
    capability: 'preview-only',
    safetyRestrictions: [
      'Renders inside a sandboxed iframe.',
      'Does not claim command execution.',
      'Used only for HTML/CSS visual preview.',
    ],
    notes: 'Preview is visual rendering only; it is not a shell or compiled runtime.',
  },
]

function defineLanguage(language: CodeLanguageDefinition): CodeLanguageDefinition {
  return language
}

function withOptionalNotes<T extends Omit<CodeLanguageDefinition, 'notes'>>(
  language: T,
  notes: string | undefined,
): CodeLanguageDefinition {
  return notes === undefined ? language : { ...language, notes }
}

function editOnly(seed: LanguageSeed): CodeLanguageDefinition {
  return withOptionalNotes(
    {
      id: seed.id,
      label: seed.label,
      editorLanguageId: seed.editorLanguageId ?? seed.id,
      extensions: seed.extensions,
      capability: 'edit-only',
      formatter: 'not-configured',
      linter: 'not-configured',
      autocomplete: 'syntax-highlighted',
      syntax: 'native',
      safetyRestrictions: [`No ${seed.label} sandbox runner is installed.`],
      testCoverage: 'registry-edit-only-no-runner',
      defaultSnippet: seed.defaultSnippet,
    },
    seed.notes,
  )
}

function dataViewer(seed: LanguageSeed): CodeLanguageDefinition {
  return withOptionalNotes(
    {
      id: seed.id,
      label: seed.label,
      editorLanguageId: seed.editorLanguageId ?? seed.id,
      extensions: seed.extensions,
      capability: 'data-viewer',
      formatter: seed.id === 'json' ? 'available' : 'not-configured',
      linter: 'not-configured',
      autocomplete: 'syntax-highlighted',
      syntax: 'native',
      safetyRestrictions: ['Data viewing/editing only; no code execution.'],
      testCoverage: 'registry-data-viewer',
      defaultSnippet: seed.defaultSnippet,
    },
    seed.notes,
  )
}

export const UNIVERSAL_LANGUAGE_REGISTRY: readonly CodeLanguageDefinition[] = [
  defineLanguage({
    id: 'javascript',
    label: 'JavaScript',
    editorLanguageId: 'javascript',
    extensions: ['.js', '.mjs', '.cjs'],
    capability: 'browser-run',
    runnerId: 'browser-javascript',
    formatter: 'not-configured',
    linter: 'not-configured',
    autocomplete: 'syntax-highlighted',
    syntax: 'native',
    safetyRestrictions: ['Browser Worker only; no filesystem access; network wrapper disabled.'],
    testCoverage: 'registry-browser-runner',
    defaultSnippet:
      "function greet(name) {\n  return `Hello, ${name}!`\n}\n\nconsole.log(greet('CodeMind'))",
  }),
  defineLanguage({
    id: 'typescript',
    label: 'TypeScript',
    editorLanguageId: 'typescript',
    extensions: ['.ts', '.tsx'],
    capability: 'server-run',
    runnerId: 'server-typescript-node',
    formatter: 'not-configured',
    linter: 'not-configured',
    autocomplete: 'syntax-highlighted',
    syntax: 'native',
    safetyRestrictions: [
      'Server vm only; no require/process/fetch/Buffer; timeout and output caps enforced.',
    ],
    testCoverage: 'registry-server-runner',
    defaultSnippet:
      "type User = { name: string }\n\nfunction greet(user: User): string {\n  return `Hello, ${user.name}!`\n}\n\nconsole.log(greet({ name: 'CodeMind' }))",
  }),
  defineLanguage({
    id: 'html',
    label: 'HTML/CSS',
    editorLanguageId: 'html',
    extensions: ['.html', '.htm'],
    capability: 'preview-only',
    runnerId: 'html-preview',
    formatter: 'not-configured',
    linter: 'not-configured',
    autocomplete: 'syntax-highlighted',
    syntax: 'native',
    safetyRestrictions: ['Sandboxed iframe preview only; no shell execution claim.'],
    testCoverage: 'registry-preview-runner',
    defaultSnippet:
      '<main>\n  <h1>Hello from CodeMind</h1>\n  <p>This is a sandboxed HTML preview.</p>\n</main>\n<style>\n  body { font-family: system-ui, sans-serif; padding: 2rem; }\n</style>',
  }),
  editOnly({
    id: 'css',
    label: 'CSS',
    extensions: ['.css'],
    defaultSnippet:
      ':root { color-scheme: dark; }\nbody { font-family: system-ui, sans-serif; }',
  }),
  editOnly({
    id: 'python',
    label: 'Python',
    extensions: ['.py'],
    defaultSnippet:
      'def greet(name: str) -> str:\n    return f"Hello, {name}!"\n\nprint(greet("CodeMind"))',
    notes:
      'Execution requires a real configured Python sandbox runner such as Pyodide or a server sandbox.',
  }),
  editOnly({
    id: 'ruby',
    label: 'Ruby',
    extensions: ['.rb'],
    defaultSnippet:
      'def greet(name)\n  "Hello, #{name}!"\nend\n\nputs greet("CodeMind")',
  }),
  editOnly({
    id: 'r',
    label: 'R',
    extensions: ['.r', '.R'],
    defaultSnippet:
      "greet <- function(name) { paste('Hello,', name) }\nprint(greet('CodeMind'))",
  }),
  editOnly({
    id: 'sql',
    label: 'SQL',
    extensions: ['.sql'],
    defaultSnippet: 'SELECT id, name\nFROM users\nWHERE active = TRUE\nORDER BY name;',
    notes: 'Add and test a real in-browser SQL engine before marking SQL executable.',
  }),
  dataViewer({
    id: 'json',
    label: 'JSON',
    extensions: ['.json'],
    defaultSnippet:
      '{\n  "name": "CodeMind",\n  "languages": ["JavaScript", "TypeScript", "Python"]\n}',
  }),
  dataViewer({
    id: 'yaml',
    label: 'YAML',
    extensions: ['.yaml', '.yml'],
    defaultSnippet: 'name: CodeMind\nlanguages:\n  - JavaScript\n  - TypeScript\n  - Python',
  }),
  dataViewer({
    id: 'markdown',
    label: 'Markdown',
    extensions: ['.md', '.mdx'],
    defaultSnippet: '# CodeMind Notes\n\n- Edit safely\n- Run only languages with real runners',
  }),
  editOnly({
    id: 'shell',
    label: 'Shell',
    extensions: ['.sh', '.bash', '.zsh'],
    defaultSnippet: '#!/usr/bin/env bash\nset -euo pipefail\n\necho "Hello from CodeMind"',
  }),
  editOnly({
    id: 'java',
    label: 'Java',
    extensions: ['.java'],
    defaultSnippet:
      'class Main {\n  public static void main(String[] args) {\n    System.out.println("Hello from CodeMind");\n  }\n}',
  }),
  editOnly({
    id: 'go',
    label: 'Go',
    extensions: ['.go'],
    defaultSnippet:
      'package main\n\nimport "fmt"\n\nfunc main() {\n  fmt.Println("Hello from CodeMind")\n}',
  }),
  editOnly({
    id: 'rust',
    label: 'Rust',
    extensions: ['.rs'],
    defaultSnippet: 'fn main() {\n    println!("Hello from CodeMind");\n}',
  }),
  editOnly({
    id: 'cpp',
    label: 'C++',
    editorLanguageId: 'cpp',
    extensions: ['.cpp', '.cc', '.cxx', '.hpp'],
    defaultSnippet:
      '#include <iostream>\n\nint main() {\n  std::cout << "Hello from CodeMind" << std::endl;\n  return 0;\n}',
  }),
  editOnly({
    id: 'c',
    label: 'C',
    extensions: ['.c', '.h'],
    defaultSnippet:
      '#include <stdio.h>\n\nint main(void) {\n  printf("Hello from CodeMind\\n");\n  return 0;\n}',
  }),
  editOnly({
    id: 'csharp',
    label: 'C#',
    editorLanguageId: 'csharp',
    extensions: ['.cs'],
    defaultSnippet: 'using System;\n\nConsole.WriteLine("Hello from CodeMind");',
  }),
  editOnly({
    id: 'php',
    label: 'PHP',
    extensions: ['.php'],
    defaultSnippet: '<?php\necho "Hello from CodeMind\\n";',
  }),
  editOnly({
    id: 'kotlin',
    label: 'Kotlin',
    extensions: ['.kt', '.kts'],
    defaultSnippet: 'fun main() {\n    println("Hello from CodeMind")\n}',
  }),
  editOnly({
    id: 'swift',
    label: 'Swift',
    extensions: ['.swift'],
    defaultSnippet: 'print("Hello from CodeMind")',
  }),
  editOnly({
    id: 'dart',
    label: 'Dart',
    extensions: ['.dart'],
    defaultSnippet: "void main() {\n  print('Hello from CodeMind');\n}",
  }),
  editOnly({
    id: 'lua',
    label: 'Lua',
    extensions: ['.lua'],
    defaultSnippet: "print('Hello from CodeMind')",
  }),
  editOnly({
    id: 'perl',
    label: 'Perl',
    extensions: ['.pl', '.pm'],
    defaultSnippet: 'use strict;\nuse warnings;\n\nprint "Hello from CodeMind\\n";',
  }),
  editOnly({
    id: 'scala',
    label: 'Scala',
    extensions: ['.scala', '.sc'],
    defaultSnippet: 'object Main extends App {\n  println("Hello from CodeMind")\n}',
  }),
  editOnly({
    id: 'haskell',
    label: 'Haskell',
    extensions: ['.hs'],
    defaultSnippet: 'main :: IO ()\nmain = putStrLn "Hello from CodeMind"',
  }),
  editOnly({
    id: 'ocaml',
    label: 'OCaml',
    extensions: ['.ml', '.mli'],
    defaultSnippet: 'print_endline "Hello from CodeMind"',
  }),
  editOnly({
    id: 'fortran',
    label: 'Fortran',
    extensions: ['.f90', '.f95', '.f03', '.f08', '.for'],
    defaultSnippet: 'program hello\n  print *, "Hello from CodeMind"\nend program hello',
  }),
  dataViewer({
    id: 'xml',
    label: 'XML',
    extensions: ['.xml', '.svg'],
    defaultSnippet: '<codemind>\n  <mode>workspace</mode>\n</codemind>',
  }),
  dataViewer({
    id: 'toml',
    label: 'TOML',
    extensions: ['.toml'],
    defaultSnippet: '[codemind]\nmode = "workspace"',
  }),
  editOnly({
    id: 'dockerfile',
    label: 'Dockerfile',
    editorLanguageId: 'dockerfile',
    extensions: ['Dockerfile', '.dockerfile'],
    defaultSnippet:
      'FROM node:22-alpine\nWORKDIR /app\nCOPY package*.json ./\nRUN npm ci --omit=dev',
  }),
  editOnly({
    id: 'powershell',
    label: 'PowerShell',
    editorLanguageId: 'powershell',
    extensions: ['.ps1', '.psm1'],
    defaultSnippet: 'Write-Output "Hello from CodeMind"',
  }),
  editOnly({
    id: 'zig',
    label: 'Zig',
    extensions: ['.zig'],
    defaultSnippet:
      'const std = @import("std");\n\npub fn main() void {\n    std.debug.print("Hello from CodeMind\\n", .{});\n}',
    notes:
      'Editor metadata only; Monaco may treat this as plain text until a syntax mode is added.',
  }),
]

const runnerIds = new Set<CodeRunnerId>(CODE_RUNNER_DEFINITIONS.map((runner) => runner.id))

export function isExecutableCapability(
  capability: CodeLanguageCapability,
): capability is Extract<CodeLanguageCapability, 'browser-run' | 'server-run' | 'preview-only'> {
  return (
    capability === 'browser-run' || capability === 'server-run' || capability === 'preview-only'
  )
}

export function findLanguageDefinition(languageId: string): CodeLanguageDefinition | undefined {
  return UNIVERSAL_LANGUAGE_REGISTRY.find((language) => language.id === languageId)
}

export function listExecutableLanguages(): CodeLanguageDefinition[] {
  return UNIVERSAL_LANGUAGE_REGISTRY.filter(
    (language) => isExecutableCapability(language.capability) && language.runnerId !== undefined,
  )
}

export function listEditOnlyLanguages(): CodeLanguageDefinition[] {
  return UNIVERSAL_LANGUAGE_REGISTRY.filter((language) => language.capability === 'edit-only')
}

export function assertExecutableLanguagesHaveRunners(): void {
  const missingRunner = UNIVERSAL_LANGUAGE_REGISTRY.filter(
    (language) => isExecutableCapability(language.capability) && language.runnerId === undefined,
  )
  if (missingRunner.length > 0) {
    throw new Error(
      `Executable languages missing runner ids: ${missingRunner.map((language) => language.id).join(', ')}`,
    )
  }

  const unknownRunner = UNIVERSAL_LANGUAGE_REGISTRY.filter(
    (language) => language.runnerId !== undefined && !runnerIds.has(language.runnerId),
  )
  if (unknownRunner.length > 0) {
    throw new Error(
      `Languages reference unregistered runners: ${unknownRunner.map((language) => language.id).join(', ')}`,
    )
  }
}

export function getDefaultWorkspaceLanguageId(): string {
  return 'javascript'
}
