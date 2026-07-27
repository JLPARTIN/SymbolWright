export type EquivalenceValue =
  string | number | boolean | null | EquivalenceValue[] | { [key: string]: EquivalenceValue }

export type EquivalenceTestCase = {
  name: string
  input: EquivalenceValue
  expected: EquivalenceValue
}

export type CrossLanguageEquivalenceExample = {
  id: string
  label: string
  spec: string
  sourceLanguageId: string
  targetLanguageId: string
  sourceImplementation: string
  targetImplementation: string
  tests: EquivalenceTestCase[]
}

export type EquivalenceObservedOutput = {
  testName: string
  actual: EquivalenceValue
}

export type EquivalenceHarnessStatus = 'PASS' | 'FAIL' | 'UNVERIFIED'

export type EquivalenceHarnessResult = {
  exampleId: string
  status: EquivalenceHarnessStatus
  passed: number
  failed: number
  findings: string[]
}

export const CROSS_LANGUAGE_EQUIVALENCE_EXAMPLES: readonly CrossLanguageEquivalenceExample[] = [
  {
    id: 'factorial-js-to-ts',
    label: 'Factorial',
    spec: 'Return n! for non-negative whole numbers. 0! is 1.',
    sourceLanguageId: 'javascript',
    targetLanguageId: 'typescript',
    sourceImplementation: `function factorial(n) {
  if (n < 0 || !Number.isInteger(n)) throw new Error('n must be a non-negative integer')
  let result = 1
  for (let current = 2; current <= n; current += 1) result *= current
  return result
}`,
    targetImplementation: `function factorial(n: number): number {
  if (n < 0 || !Number.isInteger(n)) throw new Error('n must be a non-negative integer')
  let result = 1
  for (let current = 2; current <= n; current += 1) result *= current
  return result
}`,
    tests: [
      { name: 'zero', input: 0, expected: 1 },
      { name: 'one', input: 1, expected: 1 },
      { name: 'five', input: 5, expected: 120 },
    ],
  },
  {
    id: 'fibonacci-js-to-ts',
    label: 'Fibonacci',
    spec: 'Return the nth Fibonacci number with fibonacci(0)=0 and fibonacci(1)=1.',
    sourceLanguageId: 'javascript',
    targetLanguageId: 'typescript',
    sourceImplementation: `function fibonacci(n) {
  let previous = 0
  let current = 1
  for (let index = 0; index < n; index += 1) {
    const next = previous + current
    previous = current
    current = next
  }
  return previous
}`,
    targetImplementation: `function fibonacci(n: number): number {
  let previous = 0
  let current = 1
  for (let index = 0; index < n; index += 1) {
    const next = previous + current
    previous = current
    current = next
  }
  return previous
}`,
    tests: [
      { name: 'zero', input: 0, expected: 0 },
      { name: 'one', input: 1, expected: 1 },
      { name: 'seven', input: 7, expected: 13 },
    ],
  },
  {
    id: 'palindrome-js-to-ts',
    label: 'Palindrome',
    spec: 'Normalize to lowercase alphanumeric characters, then return whether the string reads the same backward.',
    sourceLanguageId: 'javascript',
    targetLanguageId: 'typescript',
    sourceImplementation: `function isPalindrome(value) {
  const normalized = value.toLowerCase().replace(/[^a-z0-9]/g, '')
  return normalized === normalized.split('').reverse().join('')
}`,
    targetImplementation: `function isPalindrome(value: string): boolean {
  const normalized = value.toLowerCase().replace(/[^a-z0-9]/g, '')
  return normalized === normalized.split('').reverse().join('')
}`,
    tests: [
      { name: 'phrase', input: 'Never odd or even', expected: true },
      {
        name: 'punctuation',
        input: 'A man, a plan, a canal: Panama!',
        expected: true,
      },
      { name: 'negative', input: 'SymbolWright', expected: false },
    ],
  },
  {
    id: 'json-transform-js-to-ts',
    label: 'JSON transform',
    spec: 'Take a list of user records and return active user names sorted alphabetically.',
    sourceLanguageId: 'javascript',
    targetLanguageId: 'typescript',
    sourceImplementation: `function activeNames(users) {
  return users.filter((user) => user.active).map((user) => user.name).sort()
}`,
    targetImplementation: `type User = { name: string; active: boolean }

function activeNames(users: User[]): string[] {
  return users.filter((user) => user.active).map((user) => user.name).sort()
}`,
    tests: [
      {
        name: 'mixed users',
        input: [
          { name: 'Zoe', active: true },
          { name: 'Ada', active: true },
          { name: 'Linus', active: false },
        ],
        expected: ['Ada', 'Zoe'],
      },
    ],
  },
  {
    id: 'sort-numbers-js-to-ts',
    label: 'Sort numbers',
    spec: 'Return a new list sorted numerically ascending without mutating the input.',
    sourceLanguageId: 'javascript',
    targetLanguageId: 'typescript',
    sourceImplementation: `function sortNumbers(values) {
  return [...values].sort((left, right) => left - right)
}`,
    targetImplementation: `function sortNumbers(values: number[]): number[] {
  return [...values].sort((left, right) => left - right)
}`,
    tests: [
      { name: 'mixed', input: [10, 1, 4, -2], expected: [-2, 1, 4, 10] },
      { name: 'duplicates', input: [3, 3, 1], expected: [1, 3, 3] },
    ],
  },
  {
    id: 'string-normalization-js-to-ts',
    label: 'String normalization',
    spec: 'Trim, collapse whitespace, and lowercase a string.',
    sourceLanguageId: 'javascript',
    targetLanguageId: 'typescript',
    sourceImplementation: `function normalizeText(value) {
  return value.trim().replace(/\\s+/g, ' ').toLowerCase()
}`,
    targetImplementation: `function normalizeText(value: string): string {
  return value.trim().replace(/\\s+/g, ' ').toLowerCase()
}`,
    tests: [
      {
        name: 'spaces',
        input: '  SymbolWright   Workspace ',
        expected: 'symbolwright workspace',
      },
      { name: 'tabs', input: 'A\tB\nC', expected: 'a b c' },
    ],
  },
]

export function getEquivalenceExample(
  exampleId: string,
): CrossLanguageEquivalenceExample | undefined {
  return CROSS_LANGUAGE_EQUIVALENCE_EXAMPLES.find((example) => example.id === exampleId)
}

export function createEquivalenceHarnessSummary(): string {
  return CROSS_LANGUAGE_EQUIVALENCE_EXAMPLES.map(
    (example) => `${example.label}: ${example.sourceLanguageId} -> ${example.targetLanguageId}`,
  ).join('\n')
}

export function evaluateEquivalenceOutputs(
  exampleId: string,
  observedOutputs: readonly EquivalenceObservedOutput[],
): EquivalenceHarnessResult {
  const example = getEquivalenceExample(exampleId)

  if (example === undefined) {
    return {
      exampleId,
      status: 'UNVERIFIED',
      passed: 0,
      failed: 0,
      findings: [`Unknown equivalence example: ${exampleId}`],
    }
  }

  const observedByName = new Map(observedOutputs.map((output) => [output.testName, output.actual]))
  const findings: string[] = []
  let passed = 0
  let failed = 0

  for (const test of example.tests) {
    if (!observedByName.has(test.name)) {
      failed += 1
      findings.push(`${test.name}: missing observed output`)
      continue
    }

    const actual = observedByName.get(test.name)
    if (canonicalize(actual) === canonicalize(test.expected)) {
      passed += 1
    } else {
      failed += 1
      findings.push(
        `${test.name}: expected ${canonicalize(test.expected)} but received ${canonicalize(actual)}`,
      )
    }
  }

  return {
    exampleId,
    status: failed === 0 ? 'PASS' : 'FAIL',
    passed,
    failed,
    findings,
  }
}

function canonicalize(value: EquivalenceValue | undefined): string {
  if (value === undefined) {
    return 'undefined'
  }

  return JSON.stringify(sortObjectKeys(value))
}

function sortObjectKeys(value: EquivalenceValue): EquivalenceValue {
  if (Array.isArray(value)) {
    return value.map((item) => sortObjectKeys(item))
  }

  if (value !== null && typeof value === 'object') {
    const sorted: { [key: string]: EquivalenceValue } = {}
    for (const key of Object.keys(value).sort()) {
      sorted[key] = sortObjectKeys(value[key] ?? null)
    }
    return sorted
  }

  return value
}
