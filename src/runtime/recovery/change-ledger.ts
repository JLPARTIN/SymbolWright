export type RecoveryChangeKind = 'created' | 'updated' | 'deleted'

export interface RecoveryChangeRecord {
  readonly id: string
  readonly kind: RecoveryChangeKind
  readonly targetPath: string
  readonly reason: string
  readonly rollbackNote: string
  readonly previousContent?: string
  readonly nextContent?: string
}

export class RecoveryChangeLedger {
  private readonly records: RecoveryChangeRecord[] = []

  add(record: RecoveryChangeRecord): void {
    if (this.records.some((existing) => existing.id === record.id)) {
      throw new Error(`Recovery change record already exists: ${record.id}`)
    }

    if (record.targetPath.trim().length === 0) {
      throw new Error('Recovery change record targetPath is required.')
    }

    if (record.reason.trim().length === 0) {
      throw new Error('Recovery change record reason is required.')
    }

    if (record.rollbackNote.trim().length === 0) {
      throw new Error('Recovery change record rollbackNote is required.')
    }

    this.records.push(record)
  }

  list(): readonly RecoveryChangeRecord[] {
    return [...this.records]
  }

  isEmpty(): boolean {
    return this.records.length === 0
  }
}

export function createRecoveryChangeLedger(
  records: readonly RecoveryChangeRecord[] = [],
): RecoveryChangeLedger {
  const ledger = new RecoveryChangeLedger()

  for (const record of records) {
    ledger.add(record)
  }

  return ledger
}

export function renderRecoveryChangeLedger(ledger: RecoveryChangeLedger): string {
  const records = ledger.list()

  if (records.length === 0) {
    return 'CodeMind recovery change ledger\n\nNo changes recorded.'
  }

  return [
    'CodeMind recovery change ledger',
    '',
    `Changes: ${records.length}`,
    '',
    ...records.flatMap((record) => [
      `- ${record.id}: ${record.kind} ${record.targetPath}`,
      `  reason: ${record.reason}`,
      `  rollback: ${record.rollbackNote}`,
    ]),
  ].join('\n')
}
