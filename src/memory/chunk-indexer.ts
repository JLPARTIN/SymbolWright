export interface FileChunk {
  readonly filePath: string
  readonly content: string
  readonly lineStart: number
  readonly lineEnd: number
  readonly chunkIndex: number
}

export interface ChunkIndexerConfig {
  readonly chunkSize: number
  readonly chunkOverlap: number
  readonly maxFileSize: number
}

const DEFAULT_CHUNK_SIZE = 1500
const DEFAULT_CHUNK_OVERLAP = 200
const DEFAULT_MAX_FILE_SIZE = 100000

const INDEXABLE_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.py', '.rb', '.go', '.rs', '.java', '.kt',
  '.c', '.cpp', '.h', '.hpp', '.cs',
  '.json', '.yaml', '.yml', '.toml',
  '.md', '.txt', '.sh', '.bash',
  '.sql', '.graphql',
  '.css', '.scss', '.less',
  '.html', '.vue', '.svelte',
])

export function isIndexableFile(filePath: string): boolean {
  const ext = filePath.substring(filePath.lastIndexOf('.'))
  return INDEXABLE_EXTENSIONS.has(ext)
}

export function detectLanguage(filePath: string): string | undefined {
  const ext = filePath.substring(filePath.lastIndexOf('.'))
  const languageMap: Record<string, string> = {
    '.ts': 'typescript', '.tsx': 'typescript',
    '.js': 'javascript', '.jsx': 'javascript', '.mjs': 'javascript', '.cjs': 'javascript',
    '.py': 'python', '.rb': 'ruby', '.go': 'go', '.rs': 'rust',
    '.java': 'java', '.kt': 'kotlin',
    '.c': 'c', '.cpp': 'cpp', '.h': 'c', '.hpp': 'cpp', '.cs': 'csharp',
    '.json': 'json', '.yaml': 'yaml', '.yml': 'yaml', '.toml': 'toml',
    '.md': 'markdown', '.sh': 'shell', '.bash': 'shell',
    '.sql': 'sql', '.graphql': 'graphql',
    '.css': 'css', '.scss': 'scss', '.less': 'less',
    '.html': 'html', '.vue': 'vue', '.svelte': 'svelte',
  }
  return languageMap[ext]
}

export function chunkFileContent(
  filePath: string,
  content: string,
  config: ChunkIndexerConfig = {
    chunkSize: DEFAULT_CHUNK_SIZE,
    chunkOverlap: DEFAULT_CHUNK_OVERLAP,
    maxFileSize: DEFAULT_MAX_FILE_SIZE,
  },
): readonly FileChunk[] {
  if (content.length > config.maxFileSize) {
    return []
  }

  if (content.length === 0) {
    return []
  }

  const lines = content.split('\n')
  const chunks: FileChunk[] = []
  let currentChunk: string[] = []
  let currentSize = 0
  let chunkStartLine = 1
  let chunkIndex = 0

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] as string
    currentChunk.push(line)
    currentSize += line.length + 1

    if (currentSize >= config.chunkSize) {
      chunks.push({
        filePath,
        content: currentChunk.join('\n'),
        lineStart: chunkStartLine,
        lineEnd: i + 1,
        chunkIndex,
      })
      chunkIndex++

      const overlapLines = computeOverlapLines(currentChunk, config.chunkOverlap)
      currentChunk = overlapLines
      currentSize = overlapLines.join('\n').length
      chunkStartLine = i + 1 - overlapLines.length + 1
    }
  }

  if (currentChunk.length > 0) {
    const chunkContent = currentChunk.join('\n')
    if (chunkContent.trim().length > 0) {
      chunks.push({
        filePath,
        content: chunkContent,
        lineStart: chunkStartLine,
        lineEnd: lines.length,
        chunkIndex,
      })
    }
  }

  return chunks
}

function computeOverlapLines(lines: readonly string[], overlapChars: number): string[] {
  const result: string[] = []
  let size = 0

  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i] as string
    size += line.length + 1
    if (size > overlapChars) break
    result.unshift(line)
  }

  return result
}

export function generateChunkId(filePath: string, chunkIndex: number): string {
  return `${filePath}#${chunkIndex}`
}

const BOUNDARY_PATTERNS = [
  /^export\s+(function|class|interface|type|const|enum|abstract)\s/,
  /^(function|class|interface|type|const|enum|abstract)\s/,
  /^(describe|it|test)\s*\(/,
  /^(def|class)\s+\w/,
  /^(func|type)\s+\w/,
  /^(pub\s+)?(fn|struct|enum|impl|trait)\s/,
]

function isSemanticBoundary(line: string): boolean {
  const trimmed = line.trimStart()
  return BOUNDARY_PATTERNS.some((pattern) => pattern.test(trimmed))
}

export function chunkFileContentSemantic(
  filePath: string,
  content: string,
  config: ChunkIndexerConfig = {
    chunkSize: DEFAULT_CHUNK_SIZE,
    chunkOverlap: DEFAULT_CHUNK_OVERLAP,
    maxFileSize: DEFAULT_MAX_FILE_SIZE,
  },
): readonly FileChunk[] {
  if (content.length > config.maxFileSize || content.length === 0) {
    return []
  }

  const lines = content.split('\n')
  const chunks: FileChunk[] = []
  let currentChunk: string[] = []
  let currentSize = 0
  let chunkStartLine = 1
  let chunkIndex = 0

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] as string

    if (
      currentSize >= config.chunkSize * 0.6 &&
      isSemanticBoundary(line) &&
      currentChunk.length > 0
    ) {
      const chunkContent = currentChunk.join('\n')
      if (chunkContent.trim().length > 0) {
        chunks.push({
          filePath,
          content: chunkContent,
          lineStart: chunkStartLine,
          lineEnd: i,
          chunkIndex,
        })
        chunkIndex++
      }
      currentChunk = []
      currentSize = 0
      chunkStartLine = i + 1
    }

    currentChunk.push(line)
    currentSize += line.length + 1

    if (currentSize >= config.chunkSize) {
      chunks.push({
        filePath,
        content: currentChunk.join('\n'),
        lineStart: chunkStartLine,
        lineEnd: i + 1,
        chunkIndex,
      })
      chunkIndex++

      const overlapLines = computeOverlapLines(currentChunk, config.chunkOverlap)
      currentChunk = overlapLines
      currentSize = overlapLines.join('\n').length
      chunkStartLine = i + 1 - overlapLines.length + 1
    }
  }

  if (currentChunk.length > 0) {
    const chunkContent = currentChunk.join('\n')
    if (chunkContent.trim().length > 0) {
      chunks.push({
        filePath,
        content: chunkContent,
        lineStart: chunkStartLine,
        lineEnd: lines.length,
        chunkIndex,
      })
    }
  }

  return chunks
}
