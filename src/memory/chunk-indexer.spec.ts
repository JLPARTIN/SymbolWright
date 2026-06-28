import { describe, expect, it } from 'vitest'

import {
  isIndexableFile,
  detectLanguage,
  chunkFileContent,
  chunkFileContentSemantic,
  generateChunkId,
} from './chunk-indexer.js'

describe('isIndexableFile', () => {
  it('accepts TypeScript files', () => {
    expect(isIndexableFile('src/app.ts')).toBe(true)
    expect(isIndexableFile('component.tsx')).toBe(true)
  })

  it('accepts JavaScript files', () => {
    expect(isIndexableFile('index.js')).toBe(true)
    expect(isIndexableFile('config.mjs')).toBe(true)
    expect(isIndexableFile('lib.cjs')).toBe(true)
  })

  it('accepts Python files', () => {
    expect(isIndexableFile('script.py')).toBe(true)
  })

  it('accepts config files', () => {
    expect(isIndexableFile('data.json')).toBe(true)
    expect(isIndexableFile('config.yaml')).toBe(true)
    expect(isIndexableFile('settings.toml')).toBe(true)
  })

  it('rejects non-indexable files', () => {
    expect(isIndexableFile('image.png')).toBe(false)
    expect(isIndexableFile('binary.exe')).toBe(false)
    expect(isIndexableFile('archive.zip')).toBe(false)
  })
})

describe('detectLanguage', () => {
  it('detects TypeScript', () => {
    expect(detectLanguage('app.ts')).toBe('typescript')
    expect(detectLanguage('component.tsx')).toBe('typescript')
  })

  it('detects JavaScript', () => {
    expect(detectLanguage('index.js')).toBe('javascript')
    expect(detectLanguage('config.jsx')).toBe('javascript')
  })

  it('detects Python', () => {
    expect(detectLanguage('script.py')).toBe('python')
  })

  it('detects Rust', () => {
    expect(detectLanguage('lib.rs')).toBe('rust')
  })

  it('detects shell scripts', () => {
    expect(detectLanguage('deploy.sh')).toBe('shell')
    expect(detectLanguage('init.bash')).toBe('shell')
  })

  it('returns undefined for unknown extensions', () => {
    expect(detectLanguage('file.xyz')).toBeUndefined()
  })
})

describe('chunkFileContent', () => {
  it('returns empty for empty content', () => {
    expect(chunkFileContent('test.ts', '')).toHaveLength(0)
  })

  it('returns empty for oversized files', () => {
    const large = 'x'.repeat(200000)
    expect(chunkFileContent('test.ts', large)).toHaveLength(0)
  })

  it('creates a single chunk for small files', () => {
    const content = 'line 1\nline 2\nline 3'
    const chunks = chunkFileContent('test.ts', content)
    expect(chunks).toHaveLength(1)
    expect(chunks[0]!.filePath).toBe('test.ts')
    expect(chunks[0]!.content).toBe(content)
    expect(chunks[0]!.lineStart).toBe(1)
    expect(chunks[0]!.lineEnd).toBe(3)
    expect(chunks[0]!.chunkIndex).toBe(0)
  })

  it('splits large content into multiple chunks', () => {
    const lines: string[] = []
    for (let i = 0; i < 100; i++) {
      lines.push(`const x${i} = ${i}; // some padding to make lines longer`)
    }
    const content = lines.join('\n')

    const chunks = chunkFileContent('test.ts', content, {
      chunkSize: 500,
      chunkOverlap: 50,
      maxFileSize: 100000,
    })

    expect(chunks.length).toBeGreaterThan(1)
    expect(chunks[0]!.chunkIndex).toBe(0)
    expect(chunks[1]!.chunkIndex).toBe(1)
  })

  it('respects custom maxFileSize', () => {
    const content = 'x'.repeat(100)
    expect(
      chunkFileContent('test.ts', content, {
        chunkSize: 50,
        chunkOverlap: 10,
        maxFileSize: 50,
      }),
    ).toHaveLength(0)
  })

  it('chunks have correct file path', () => {
    const chunks = chunkFileContent('src/foo.ts', 'hello world')
    expect(chunks[0]!.filePath).toBe('src/foo.ts')
  })

  it('skips whitespace-only trailing chunks', () => {
    const content = 'real content\n   \n  '
    const chunks = chunkFileContent('test.ts', content)
    for (const chunk of chunks) {
      expect(chunk.content.trim().length).toBeGreaterThan(0)
    }
  })
})

describe('chunkFileContentSemantic', () => {
  it('returns empty for empty content', () => {
    expect(chunkFileContentSemantic('test.ts', '')).toHaveLength(0)
  })

  it('returns empty for oversized files', () => {
    const large = 'x'.repeat(200000)
    expect(chunkFileContentSemantic('test.ts', large)).toHaveLength(0)
  })

  it('creates a single chunk for small files', () => {
    const content = 'const x = 1\nconst y = 2'
    const chunks = chunkFileContentSemantic('test.ts', content)
    expect(chunks).toHaveLength(1)
    expect(chunks[0]!.content).toBe(content)
  })

  it('splits at function boundaries when chunk is large enough', () => {
    const func1Lines = Array.from({ length: 20 }, (_, i) => `  const line${i} = ${i};`)
    const func1 = `export function first() {\n${func1Lines.join('\n')}\n}`
    const func2Lines = Array.from({ length: 20 }, (_, i) => `  const val${i} = ${i};`)
    const func2 = `export function second() {\n${func2Lines.join('\n')}\n}`
    const content = func1 + '\n\n' + func2

    const chunks = chunkFileContentSemantic('test.ts', content, {
      chunkSize: 400,
      chunkOverlap: 50,
      maxFileSize: 100000,
    })

    expect(chunks.length).toBeGreaterThanOrEqual(2)
    expect(chunks[0]!.content).toContain('export function first')
  })

  it('splits at class boundaries', () => {
    const class1 = 'export class Foo {\n' + '  x = 1;\n'.repeat(30) + '}'
    const class2 = 'export class Bar {\n' + '  y = 2;\n'.repeat(30) + '}'
    const content = class1 + '\n\n' + class2

    const chunks = chunkFileContentSemantic('test.ts', content, {
      chunkSize: 300,
      chunkOverlap: 50,
      maxFileSize: 100000,
    })

    expect(chunks.length).toBeGreaterThanOrEqual(2)
  })

  it('splits at describe/it boundaries for test files', () => {
    const block1 = 'describe("suite1", () => {\n' + '  const x = 1;\n'.repeat(25) + '})'
    const block2 = 'describe("suite2", () => {\n' + '  const y = 2;\n'.repeat(25) + '})'
    const content = block1 + '\n\n' + block2

    const chunks = chunkFileContentSemantic('test.spec.ts', content, {
      chunkSize: 300,
      chunkOverlap: 50,
      maxFileSize: 100000,
    })

    expect(chunks.length).toBeGreaterThanOrEqual(2)
  })

  it('falls back to size-based splitting when no boundaries found', () => {
    const lines = Array.from({ length: 100 }, (_, i) => `const x${i} = ${i};`)
    const content = lines.join('\n')

    const chunks = chunkFileContentSemantic('data.ts', content, {
      chunkSize: 500,
      chunkOverlap: 50,
      maxFileSize: 100000,
    })

    expect(chunks.length).toBeGreaterThan(1)
  })
})

describe('generateChunkId', () => {
  it('generates deterministic id from path and index', () => {
    expect(generateChunkId('src/app.ts', 0)).toBe('src/app.ts#0')
    expect(generateChunkId('src/app.ts', 3)).toBe('src/app.ts#3')
  })
})
