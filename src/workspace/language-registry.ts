import {
  PYODIDE_BROWSER_RUNNER_ID,
  PYODIDE_BROWSER_RUNNER_SAFETY,
  PYODIDE_BROWSER_STARTER_SNIPPET,
} from './pyodide-browser-runner.js'
import {
  SQL_BROWSER_RUNNER_ID,
  SQL_BROWSER_RUNNER_SAFETY,
  SQL_BROWSER_STARTER_SNIPPET,
} from './sql-browser-runner.js'

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
  SQL_BROWSER_RUNNER_ID,
  PYODIDE_BROWSER_RUNNER_ID,
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

type ExecutableLanguageSeed = LanguageSeed & {
  capability: Extract<CodeLanguageCapability, 'browser-run' | 'server-run' | 'preview-only'>
  runnerId: CodeRunnerId
  safetyRestrictions: string[]
  testCoverage: string
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
  {
    id: SQL_BROWSER_RUNNER_ID,
    label: 'Browser sql.js SQLite Worker',
    capability: 'browser-run',
    safetyRestrictions: [...SQL_BROWSER_RUNNER_SAFETY],
    notes: 'Uses the installed sql.js package served from this CodeMind web server.',
  },
  {
    id: PYODIDE_BROWSER_RUNNER_ID,
    label: 'Browser Pyodide Python Worker',
    capability: 'browser-run',
    safetyRestrictions: [...PYODIDE_BROWSER_RUNNER_SAFETY],
    notes:
      'Loads the Pyodide browser runtime in a Worker; no CodeMind server-side Python execution is exposed.',
  },
]

function withNotes(
  language: Omit<CodeLanguageDefinition, 'notes'>,
  notes: string | undefined,
): CodeLanguageDefinition {
  return notes === undefined ? language : { ...language, notes }
}

function executable(seed: ExecutableLanguageSeed): CodeLanguageDefinition {
  return withNotes(
    {
      id: seed.id,
      label: seed.label,
      editorLanguageId: seed.editorLanguageId ?? seed.id,
      extensions: seed.extensions,
      capability: seed.capability,
      runnerId: seed.runnerId,
      formatter: 'not-configured',
      linter: 'not-configured',
      autocomplete: 'syntax-highlighted',
      syntax: 'native',
      safetyRestrictions: seed.safetyRestrictions,
      testCoverage: seed.testCoverage,
      defaultSnippet: seed.defaultSnippet,
    },
    seed.notes,
  )
}

function editOnly(seed: LanguageSeed): CodeLanguageDefinition {
  return withNotes(
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
  return withNotes(
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

const EXECUTABLE_LANGUAGE_SEEDS: readonly ExecutableLanguageSeed[] = [
  {
    id: 'javascript',
    label: 'JavaScript',
    editorLanguageId: 'javascript',
    extensions: ['.js', '.mjs', '.cjs'],
    capability: 'browser-run',
    runnerId: 'browser-javascript',
    safetyRestrictions: ['Browser Worker only; no filesystem access; network wrapper disabled.'],
    testCoverage: 'registry-browser-runner',
    defaultSnippet:
      "function greet(name) {\n  return `Hello, ${name}!`\n}\n\nconsole.log(greet('CodeMind'))",
  },
  {
    id: 'typescript',
    label: 'TypeScript',
    editorLanguageId: 'typescript',
    extensions: ['.ts', '.tsx'],
    capability: 'server-run',
    runnerId: 'server-typescript-node',
    safetyRestrictions: [
      'Server vm only; no require/process/fetch/Buffer; timeout and output caps enforced.',
    ],
    testCoverage: 'registry-server-runner',
    defaultSnippet:
      "type User = { name: string }\n\nfunction greet(user: User): string {\n  return `Hello, ${user.name}!`\n}\n\nconsole.log(greet({ name: 'CodeMind' }))",
  },
  {
    id: 'html',
    label: 'HTML/CSS',
    editorLanguageId: 'html',
    extensions: ['.html', '.htm'],
    capability: 'preview-only',
    runnerId: 'html-preview',
    safetyRestrictions: ['Sandboxed iframe preview only; no shell execution claim.'],
    testCoverage: 'registry-preview-runner',
    defaultSnippet:
      '<main>\n  <h1>Hello from CodeMind</h1>\n  <p>This is a sandboxed HTML preview.</p>\n</main>\n<style>\n  body { font-family: system-ui, sans-serif; padding: 2rem; }\n</style>',
  },
  {
    id: 'sql',
    label: 'SQL',
    editorLanguageId: 'sql',
    extensions: ['.sql'],
    capability: 'browser-run',
    runnerId: SQL_BROWSER_RUNNER_ID,
    safetyRestrictions: [...SQL_BROWSER_RUNNER_SAFETY],
    testCoverage: 'registry-sqljs-browser-runner',
    defaultSnippet: SQL_BROWSER_STARTER_SNIPPET,
    notes: 'Runs SQLite-compatible SQL through sql.js in a browser Worker.',
  },
  {
    id: 'python',
    label: 'Python',
    editorLanguageId: 'python',
    extensions: ['.py'],
    capability: 'browser-run',
    runnerId: PYODIDE_BROWSER_RUNNER_ID,
    safetyRestrictions: [...PYODIDE_BROWSER_RUNNER_SAFETY],
    testCoverage: 'registry-pyodide-browser-runner',
    defaultSnippet: PYODIDE_BROWSER_STARTER_SNIPPET,
    notes:
      'Runs Python through Pyodide in a browser Worker. First run must fetch Pyodide browser assets.',
  },
]

const EDIT_ONLY_LANGUAGE_SEEDS: readonly LanguageSeed[] = [
  {
    id: 'css',
    label: 'CSS',
    extensions: ['.css'],
    defaultSnippet: ':root { color-scheme: dark; }\nbody { font-family: system-ui, sans-serif; }',
  },
  {
    id: 'ruby',
    label: 'Ruby',
    extensions: ['.rb'],
    defaultSnippet: 'def greet(name)\n  "Hello, #{name}!"\nend\n\nputs greet("CodeMind")',
  },
  {
    id: 'r',
    label: 'R',
    extensions: ['.r', '.R'],
    defaultSnippet: "greet <- function(name) { paste('Hello,', name) }\nprint(greet('CodeMind'))",
  },
  {
    id: 'shell',
    label: 'Shell',
    extensions: ['.sh', '.bash', '.zsh'],
    defaultSnippet: '#!/usr/bin/env bash\nset -euo pipefail\n\necho "Hello from CodeMind"',
  },
  {
    id: 'java',
    label: 'Java',
    extensions: ['.java'],
    defaultSnippet:
      'class Main {\n  public static void main(String[] args) {\n    System.out.println("Hello from CodeMind");\n  }\n}',
  },
  {
    id: 'go',
    label: 'Go',
    extensions: ['.go'],
    defaultSnippet:
      'package main\n\nimport "fmt"\n\nfunc main() {\n  fmt.Println("Hello from CodeMind")\n}',
  },
  {
    id: 'rust',
    label: 'Rust',
    extensions: ['.rs'],
    defaultSnippet: 'fn main() {\n    println!("Hello from CodeMind");\n}',
  },
  {
    id: 'cpp',
    label: 'C++',
    editorLanguageId: 'cpp',
    extensions: ['.cpp', '.cc', '.cxx', '.hpp'],
    defaultSnippet:
      '#include <iostream>\n\nint main() {\n  std::cout << "Hello from CodeMind" << std::endl;\n  return 0;\n}',
  },
  {
    id: 'c',
    label: 'C',
    extensions: ['.c', '.h'],
    defaultSnippet:
      '#include <stdio.h>\n\nint main(void) {\n  printf("Hello from CodeMind\\n");\n  return 0;\n}',
  },
  {
    id: 'csharp',
    label: 'C#',
    editorLanguageId: 'csharp',
    extensions: ['.cs'],
    defaultSnippet: 'using System;\n\nConsole.WriteLine("Hello from CodeMind");',
  },
  {
    id: 'php',
    label: 'PHP',
    extensions: ['.php'],
    defaultSnippet: '<?php\necho "Hello from CodeMind\\n";',
  },
  {
    id: 'kotlin',
    label: 'Kotlin',
    extensions: ['.kt', '.kts'],
    defaultSnippet: 'fun main() {\n    println("Hello from CodeMind")\n}',
  },
  {
    id: 'swift',
    label: 'Swift',
    extensions: ['.swift'],
    defaultSnippet: 'print("Hello from CodeMind")',
  },
  {
    id: 'dart',
    label: 'Dart',
    extensions: ['.dart'],
    defaultSnippet: "void main() {\n  print('Hello from CodeMind');\n}",
  },
  {
    id: 'lua',
    label: 'Lua',
    extensions: ['.lua'],
    defaultSnippet: "print('Hello from CodeMind')",
  },
  {
    id: 'perl',
    label: 'Perl',
    extensions: ['.pl', '.pm'],
    defaultSnippet: 'use strict;\nuse warnings;\n\nprint "Hello from CodeMind\\n";',
  },
  {
    id: 'scala',
    label: 'Scala',
    extensions: ['.scala', '.sc'],
    defaultSnippet: 'object Main extends App {\n  println("Hello from CodeMind")\n}',
  },
  {
    id: 'haskell',
    label: 'Haskell',
    extensions: ['.hs'],
    defaultSnippet: 'main :: IO ()\nmain = putStrLn "Hello from CodeMind"',
  },
  {
    id: 'ocaml',
    label: 'OCaml',
    extensions: ['.ml', '.mli'],
    defaultSnippet: 'print_endline "Hello from CodeMind"',
  },
  {
    id: 'fortran',
    label: 'Fortran',
    extensions: ['.f90', '.f95', '.f03', '.f08', '.for'],
    defaultSnippet: 'program hello\n  print *, "Hello from CodeMind"\nend program hello',
  },
  {
    id: 'dockerfile',
    label: 'Dockerfile',
    editorLanguageId: 'dockerfile',
    extensions: ['Dockerfile', '.dockerfile'],
    defaultSnippet:
      'FROM node:22-alpine\nWORKDIR /app\nCOPY package*.json ./\nRUN npm ci --omit=dev',
  },
  {
    id: 'powershell',
    label: 'PowerShell',
    editorLanguageId: 'powershell',
    extensions: ['.ps1', '.psm1'],
    defaultSnippet: 'Write-Output "Hello from CodeMind"',
  },
  {
    id: 'zig',
    label: 'Zig',
    extensions: ['.zig'],
    defaultSnippet:
      'const std = @import("std");\n\npub fn main() void {\n    std.debug.print("Hello from CodeMind\\n", .{});\n}',
    notes:
      'Editor metadata only; Monaco may treat this as plain text until a syntax mode is added.',
  },
]

const DATA_VIEWER_LANGUAGE_SEEDS: readonly LanguageSeed[] = [
  {
    id: 'json',
    label: 'JSON',
    extensions: ['.json'],
    defaultSnippet:
      '{\n  "name": "CodeMind",\n  "languages": ["JavaScript", "TypeScript", "Python"]\n}',
  },
  {
    id: 'yaml',
    label: 'YAML',
    extensions: ['.yaml', '.yml'],
    defaultSnippet: 'name: CodeMind\nlanguages:\n  - JavaScript\n  - TypeScript\n  - Python',
  },
  {
    id: 'markdown',
    label: 'Markdown',
    extensions: ['.md', '.mdx'],
    defaultSnippet: '# CodeMind Notes\n\n- Edit safely\n- Run only languages with real runners',
  },
  {
    id: 'xml',
    label: 'XML',
    extensions: ['.xml', '.svg'],
    defaultSnippet: '<codemind>\n  <mode>workspace</mode>\n</codemind>',
  },
  {
    id: 'toml',
    label: 'TOML',
    extensions: ['.toml'],
    defaultSnippet: '[codemind]\nmode = "workspace"',
  },
]

export const UNIVERSAL_LANGUAGE_REGISTRY: readonly CodeLanguageDefinition[] = [
  ...EXECUTABLE_LANGUAGE_SEEDS.map((seed) => executable(seed)),
  ...EDIT_ONLY_LANGUAGE_SEEDS.map((seed) => editOnly(seed)),
  ...DATA_VIEWER_LANGUAGE_SEEDS.map((seed) => dataViewer(seed)),
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
