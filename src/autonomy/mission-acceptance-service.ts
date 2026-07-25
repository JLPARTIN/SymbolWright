import path from 'node:path'

import {
  createMissionAcceptancePacket,
  MissionAcceptancePacketStore,
  type MissionAcceptancePacket,
} from './mission-acceptance-packet.js'
import { createMissionImpactIntelligence } from './mission-impact-intelligence.js'
import { JsonMissionExecutionStore } from './persistent-mission-executor.js'
import { RepositorySemanticIndexStore } from './repository-semantic-index-store.js'
import type { RepositorySemanticIndexSnapshot } from './repository-semantic-index.types.js'

export interface MissionAcceptanceServiceOptions {
  readonly workspaceRoot: string
  readonly repositoryRoot?: string
  readonly validationCommands?: readonly string[]
  readonly loadSemanticIndex?: (
    repositoryRoot: string,
  ) => Promise<RepositorySemanticIndexSnapshot | undefined>
  readonly now?: () => Date
}

export class MissionAcceptanceService {
  readonly #executionStore: JsonMissionExecutionStore
  readonly #packetStore: MissionAcceptancePacketStore
  readonly #repositoryRoot: string
  readonly #validationCommands: readonly string[] | undefined
  readonly #loadSemanticIndex: (
    repositoryRoot: string,
  ) => Promise<RepositorySemanticIndexSnapshot | undefined>
  readonly #now: () => Date

  constructor(options: MissionAcceptanceServiceOptions) {
    const workspaceRoot = path.resolve(options.workspaceRoot)
    const semanticIndexStore = new RepositorySemanticIndexStore(
      path.join(workspaceRoot, '.symbolwright'),
    )
    this.#executionStore = new JsonMissionExecutionStore(workspaceRoot)
    this.#packetStore = new MissionAcceptancePacketStore(workspaceRoot)
    this.#repositoryRoot = path.resolve(options.repositoryRoot ?? workspaceRoot)
    this.#validationCommands = options.validationCommands
    this.#loadSemanticIndex =
      options.loadSemanticIndex ?? ((repositoryRoot) => semanticIndexStore.load(repositoryRoot))
    this.#now = options.now ?? (() => new Date())
  }

  async generate(missionId: string): Promise<{
    readonly packet: MissionAcceptancePacket
    readonly path: string
  }> {
    const execution = await this.#executionStore.load(missionId)
    if (execution === undefined) {
      throw new Error(`Mission execution ${missionId} was not found.`)
    }

    const semanticIndex = await this.#loadSemanticIndex(this.#repositoryRoot)
    const intelligence =
      semanticIndex === undefined
        ? undefined
        : createMissionImpactIntelligence({
            execution,
            semanticIndex,
            ...(this.#validationCommands === undefined
              ? {}
              : { validationCommands: this.#validationCommands }),
          })
    const packet = createMissionAcceptancePacket({
      execution,
      generatedAt: this.#now().toISOString(),
      ...(intelligence === undefined ? {} : { intelligence }),
    })
    const packetPath = await this.#packetStore.save(packet)
    return { packet, path: packetPath }
  }
}
