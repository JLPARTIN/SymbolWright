import { renderNotYetActive } from './cli-commands.js'
import { renderSandboxDoctorCommand, renderSandboxImagesCommand } from './sandbox/sandbox-doctor.js'

export async function renderSandboxCommand(args: readonly string[]): Promise<string> {
  const [subcommand] = args

  if (subcommand === undefined || subcommand === 'doctor') {
    return renderSandboxDoctorCommand()
  }

  if (subcommand === 'images') {
    return renderSandboxImagesCommand()
  }

  if (subcommand === 'list') {
    return renderSandboxDoctorCommand()
  }

  return renderNotYetActive(args.length > 0 ? `sandbox ${args.join(' ')}` : 'sandbox')
}
