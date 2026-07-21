import { renderNotYetActive } from './cli-commands.js'
import {
  renderSandboxDoctorCommand,
  renderSandboxImagesCommand,
  type SandboxDoctorOptions,
} from './sandbox/sandbox-doctor.js'

export async function renderSandboxCommand(
  args: readonly string[],
  options: SandboxDoctorOptions = {},
): Promise<string> {
  const [subcommand] = args

  if (subcommand === undefined || subcommand === 'doctor') {
    return renderSandboxDoctorCommand(options)
  }

  if (subcommand === 'images') {
    return renderSandboxImagesCommand(options)
  }

  if (subcommand === 'list') {
    return renderSandboxDoctorCommand(options)
  }

  return renderNotYetActive(args.length > 0 ? `sandbox ${args.join(' ')}` : 'sandbox')
}
