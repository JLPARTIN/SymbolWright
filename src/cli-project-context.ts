import {
  buildProjectContextPacket,
  renderProjectContextPacket,
} from './context/project-context-kernel.js'

export function renderProjectContextCommand(dir: string): string {
  const packet = buildProjectContextPacket(dir)
  return renderProjectContextPacket(packet)
}
