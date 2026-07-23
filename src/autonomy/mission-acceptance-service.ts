import {
  createMissionAcceptancePacket,
  MissionAcceptancePacketStore,
  type MissionAcceptancePacket,
} from './mission-acceptance-packet.js'
import { JsonMissionExecutionStore } from './persistent-mission-executor.js'

export interface MissionAcceptanceServiceOptions {
  readonly workspaceRoot: string
  readonly now?: () => Date
}

export class MissionAcceptanceService {
  readonly #executionStore: JsonMissionExecutionStore
  readonly #packetStore: MissionAcceptancePacketStore
  readonly #now: () => Date

  constructor(options: MissionAcceptanceServiceOptions) {
    this.#executionStore = new JsonMissionExecutionStore(options.workspaceRoot)
    this.#packetStore = new MissionAcceptancePacketStore(options.workspaceRoot)
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

    const packet = createMissionAcceptancePacket({
      execution,
      generatedAt: this.#now().toISOString(),
    })
    const packetPath = await this.#packetStore.save(packet)
    return { packet, path: packetPath }
  }
}
