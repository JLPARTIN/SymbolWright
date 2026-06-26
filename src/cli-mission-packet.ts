import fs from 'node:fs'

import {
  buildAgentKernelMissionPacket,
  renderAgentKernelMissionPacket,
  type AgentKernelMissionPacketInput,
} from './kernel/agent-kernel-mission-packet.js'

export function renderMissionPacketCommand(fixturePath: string): string {
  const raw = JSON.parse(fs.readFileSync(fixturePath, 'utf8')) as AgentKernelMissionPacketInput

  if (typeof raw.missionId !== 'string' || raw.missionId.trim().length === 0) {
    throw new Error('Fixture must include a non-empty "missionId" field.')
  }

  if (raw.contextPacket === undefined || typeof raw.contextPacket !== 'object') {
    throw new Error('Fixture must include a "contextPacket" object.')
  }

  if (raw.routePlan === undefined || typeof raw.routePlan !== 'object') {
    throw new Error('Fixture must include a "routePlan" object.')
  }

  if (raw.preflightDecision === undefined || typeof raw.preflightDecision !== 'object') {
    throw new Error('Fixture must include a "preflightDecision" object.')
  }

  const packet = buildAgentKernelMissionPacket(raw)
  return renderAgentKernelMissionPacket(packet)
}
