import { gunzipSync } from 'node:zlib'

import type { DependencyAcquisitionLimits } from './dependency-policy.js'

export interface NpmTarballEntry {
  readonly path: string
  readonly type: 'file' | 'directory'
  readonly size: number
}

export interface NpmTarballInspection {
  readonly archiveBytes: number
  readonly expandedBytes: number
  readonly fileCount: number
  readonly entries: readonly NpmTarballEntry[]
}

export class NpmTarballInspectionError extends Error {
  public readonly code: string

  public constructor(code: string, message: string) {
    super(message)
    this.name = 'NpmTarballInspectionError'
    this.code = code
  }
}

const TAR_BLOCK_BYTES = 512
const TAR_END_BLOCKS = 2

/**
 * Inspects a gzip-compressed npm tarball without writing attacker-controlled paths to disk.
 * The decompressor is hard-capped and every tar entry is validated before any later extraction.
 */
export function inspectNpmTarball(
  archive: Uint8Array,
  limits: DependencyAcquisitionLimits,
): NpmTarballInspection {
  if (archive.byteLength > limits.maxArchiveBytes) {
    throw new NpmTarballInspectionError(
      'DEPENDENCY_ARCHIVE_QUOTA_EXCEEDED',
      `Dependency archive is ${archive.byteLength} bytes; policy allows ${limits.maxArchiveBytes}.`,
    )
  }

  let tar: Buffer
  try {
    tar = gunzipSync(archive, { maxOutputLength: limits.maxExpandedBytes + TAR_BLOCK_BYTES })
  } catch (error) {
    if (isOutputLimitError(error)) {
      throw new NpmTarballInspectionError(
        'DEPENDENCY_EXPANDED_QUOTA_EXCEEDED',
        `Expanded dependency archive exceeds ${limits.maxExpandedBytes} bytes.`,
      )
    }
    throw new NpmTarballInspectionError(
      'DEPENDENCY_ARCHIVE_INVALID',
      'Dependency archive is not a valid bounded gzip stream.',
    )
  }
  if (tar.byteLength > limits.maxExpandedBytes) {
    throw new NpmTarballInspectionError(
      'DEPENDENCY_EXPANDED_QUOTA_EXCEEDED',
      `Expanded dependency archive is ${tar.byteLength} bytes; policy allows ${limits.maxExpandedBytes}.`,
    )
  }
  if (tar.byteLength % TAR_BLOCK_BYTES !== 0) {
    throw new NpmTarballInspectionError(
      'DEPENDENCY_TAR_INVALID',
      'Dependency tar stream is not aligned to 512-byte records.',
    )
  }

  const entries: NpmTarballEntry[] = []
  let fileCount = 0
  let expandedBytes = 0
  let offset = 0
  let endBlocks = 0

  while (offset < tar.byteLength) {
    const header = tar.subarray(offset, offset + TAR_BLOCK_BYTES)
    if (isZeroBlock(header)) {
      endBlocks += 1
      offset += TAR_BLOCK_BYTES
      if (endBlocks >= TAR_END_BLOCKS) break
      continue
    }
    if (endBlocks > 0) {
      throw new NpmTarballInspectionError(
        'DEPENDENCY_TAR_INVALID',
        'Dependency tar contains data after an end-of-archive record.',
      )
    }

    verifyTarChecksum(header)
    const entryPath = parseEntryPath(header)
    const typeFlag = header[156] ?? 0
    const size = parseTarNumber(header.subarray(124, 136), 'entry size')
    const entryType = classifyEntryType(typeFlag, entryPath)
    if (entryType === 'file') {
      fileCount += 1
      expandedBytes += size
      if (fileCount > limits.maxFiles) {
        throw new NpmTarballInspectionError(
          'DEPENDENCY_FILE_COUNT_QUOTA_EXCEEDED',
          `Dependency archive contains more than ${limits.maxFiles} files.`,
        )
      }
      if (size > limits.maxFileBytes) {
        throw new NpmTarballInspectionError(
          'DEPENDENCY_FILE_QUOTA_EXCEEDED',
          `Dependency archive entry ${entryPath} is ${size} bytes; policy allows ${limits.maxFileBytes}.`,
        )
      }
      if (expandedBytes > limits.maxTotalBytes) {
        throw new NpmTarballInspectionError(
          'DEPENDENCY_TOTAL_BYTES_QUOTA_EXCEEDED',
          `Dependency file content exceeds ${limits.maxTotalBytes} bytes.`,
        )
      }
    } else if (size !== 0) {
      throw new NpmTarballInspectionError(
        'DEPENDENCY_TAR_INVALID',
        `Directory entry ${entryPath} declares non-zero content.`,
      )
    }

    entries.push({ path: entryPath, type: entryType, size })
    const dataBlocks = Math.ceil(size / TAR_BLOCK_BYTES)
    const nextOffset = offset + TAR_BLOCK_BYTES + dataBlocks * TAR_BLOCK_BYTES
    if (!Number.isSafeInteger(nextOffset) || nextOffset > tar.byteLength) {
      throw new NpmTarballInspectionError(
        'DEPENDENCY_TAR_TRUNCATED',
        `Dependency archive entry ${entryPath} exceeds the tar stream boundary.`,
      )
    }
    offset = nextOffset
  }

  if (endBlocks < TAR_END_BLOCKS) {
    throw new NpmTarballInspectionError(
      'DEPENDENCY_TAR_TRUNCATED',
      'Dependency tar does not contain two terminal zero records.',
    )
  }
  if (entries.length === 0) {
    throw new NpmTarballInspectionError(
      'DEPENDENCY_TAR_EMPTY',
      'Dependency tar contains no package entries.',
    )
  }
  if (!entries.some((entry) => entry.path === 'package/package.json')) {
    throw new NpmTarballInspectionError(
      'DEPENDENCY_PACKAGE_MANIFEST_MISSING',
      'npm dependency tarball must contain package/package.json.',
    )
  }

  return Object.freeze({
    archiveBytes: archive.byteLength,
    expandedBytes,
    fileCount,
    entries: Object.freeze(entries.map((entry) => Object.freeze(entry))),
  })
}

function classifyEntryType(typeFlag: number, entryPath: string): 'file' | 'directory' {
  if (typeFlag === 0 || typeFlag === 48) return 'file'
  if (typeFlag === 53) return 'directory'
  if (typeFlag === 49 || typeFlag === 50) {
    throw new NpmTarballInspectionError(
      'DEPENDENCY_ARCHIVE_LINK_FORBIDDEN',
      `Dependency archive links are forbidden: ${entryPath}`,
    )
  }
  if (typeFlag === 51 || typeFlag === 52 || typeFlag === 54) {
    throw new NpmTarballInspectionError(
      'DEPENDENCY_ARCHIVE_SPECIAL_FILE_FORBIDDEN',
      `Dependency archive special files are forbidden: ${entryPath}`,
    )
  }
  throw new NpmTarballInspectionError(
    'DEPENDENCY_TAR_TYPE_UNSUPPORTED',
    `Dependency archive entry type ${String.fromCharCode(typeFlag)} is unsupported: ${entryPath}`,
  )
}

function parseEntryPath(header: Buffer): string {
  const name = readTarString(header.subarray(0, 100))
  const prefix = readTarString(header.subarray(345, 500))
  const combined = prefix.length === 0 ? name : `${prefix}/${name}`
  const slashNormalized = combined.replace(/\\/g, '/')
  const normalized = slashNormalized.endsWith('/') ? slashNormalized.slice(0, -1) : slashNormalized
  if (normalized.length === 0 || normalized.length > 512) {
    throw new NpmTarballInspectionError(
      'DEPENDENCY_ARCHIVE_PATH_INVALID',
      'Dependency archive contains an empty or oversized path.',
    )
  }
  if (normalized.startsWith('/') || /^[A-Za-z]:\//.test(normalized)) {
    throw new NpmTarballInspectionError(
      'DEPENDENCY_ARCHIVE_PATH_ESCAPE',
      `Dependency archive contains an absolute path: ${normalized}`,
    )
  }
  const segments = normalized.split('/')
  if (segments.some((segment) => segment === '' || segment === '.' || segment === '..')) {
    throw new NpmTarballInspectionError(
      'DEPENDENCY_ARCHIVE_PATH_ESCAPE',
      `Dependency archive path escapes or aliases the package root: ${normalized}`,
    )
  }
  if (segments[0] !== 'package') {
    throw new NpmTarballInspectionError(
      'DEPENDENCY_ARCHIVE_ROOT_INVALID',
      `npm dependency archive entry must remain beneath package/: ${normalized}`,
    )
  }
  return normalized
}

function verifyTarChecksum(header: Buffer): void {
  const expected = parseTarNumber(header.subarray(148, 156), 'header checksum')
  let unsigned = 0
  let signed = 0
  for (let index = 0; index < header.byteLength; index += 1) {
    const byte = index >= 148 && index < 156 ? 32 : (header[index] ?? 0)
    unsigned += byte
    signed += byte > 127 ? byte - 256 : byte
  }
  if (expected !== unsigned && expected !== signed) {
    throw new NpmTarballInspectionError(
      'DEPENDENCY_TAR_CHECKSUM_MISMATCH',
      'Dependency tar header checksum is invalid.',
    )
  }
}

function parseTarNumber(field: Buffer, label: string): number {
  if ((field[0] ?? 0) & 0x80) {
    throw new NpmTarballInspectionError(
      'DEPENDENCY_TAR_NUMBER_UNSUPPORTED',
      `Binary tar ${label} encoding is unsupported.`,
    )
  }
  const text = readTarString(field).trim()
  if (text.length === 0) return 0
  if (!/^[0-7]+$/.test(text)) {
    throw new NpmTarballInspectionError(
      'DEPENDENCY_TAR_INVALID',
      `Dependency tar ${label} is not valid octal.`,
    )
  }
  const parsed = Number.parseInt(text, 8)
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new NpmTarballInspectionError(
      'DEPENDENCY_TAR_INVALID',
      `Dependency tar ${label} exceeds safe integer bounds.`,
    )
  }
  return parsed
}

function readTarString(field: Buffer): string {
  const zero = field.indexOf(0)
  const bytes = zero < 0 ? field : field.subarray(0, zero)
  const value = bytes.toString('utf8')
  if (value.includes('\uFFFD') || containsControlCharacter(value)) {
    throw new NpmTarballInspectionError(
      'DEPENDENCY_ARCHIVE_PATH_INVALID',
      'Dependency tar contains invalid path text.',
    )
  }
  return value
}

function containsControlCharacter(value: string): boolean {
  for (const character of value) {
    const code = character.charCodeAt(0)
    if (code <= 31 || code === 127) return true
  }
  return false
}

function isZeroBlock(block: Buffer): boolean {
  for (const byte of block) if (byte !== 0) return false
  return true
}

function isOutputLimitError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  const code = 'code' in error ? String((error as NodeJS.ErrnoException).code) : ''
  const message = error.message.toLowerCase()
  return (
    code === 'ERR_BUFFER_TOO_LARGE' ||
    message.includes('maxoutputlength') ||
    message.includes('larger than')
  )
}
