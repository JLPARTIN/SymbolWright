import { describe, expect, it } from 'vitest'

import {
  isIndexableFile,
  detectLanguage,
  chunkFileContent,
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
    expect(chunkFileContent('test.ts', content, {
      chunkSize: 50,
      chunkOverlap: 10,
      maxFileSize: 50,
    })).toHaveLength(0)
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

describe('generateChunkId', () => {
  it('generates deterministic id from path and index', () => {
    expect(generateChunkId('src/app.ts', 0)).toBe('src/app.ts#0')
    expect(generateChunkId('src/app.ts', 3)).toBe('src/app.ts#3')
  })
})
