import {
  buildUniversalApiContractReport,
  renderUniversalApiContractReport,
} from './api/universal-api-contract.js'
import {
  assessBrowserWorkspaceReadiness,
  renderBrowserWorkspaceReadinessReport,
} from './workspace/browser-workspace-contract.js'
import {
  buildProviderAdapterContractReport,
  renderProviderAdapterContractReport,
} from './providers/provider-adapter-contract.js'

export function renderUniversalApiContractCommand(): string {
  return [
    renderUniversalApiContractReport(buildUniversalApiContractReport()),
    '',
    renderProviderAdapterContractReport(buildProviderAdapterContractReport()),
    '',
    renderBrowserWorkspaceReadinessReport(assessBrowserWorkspaceReadiness()),
  ].join('\n')
}
