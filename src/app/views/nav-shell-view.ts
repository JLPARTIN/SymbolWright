export interface AppNavEntry {
  readonly id: string
  readonly label: string
}

export const APP_NAV_ENTRIES: readonly AppNavEntry[] = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'missions', label: 'Missions' },
  { id: 'autonomy', label: 'AI Mission Control' },
  { id: 'workspace', label: 'Workspace' },
  { id: 'repository', label: 'Repository' },
  { id: 'agent', label: 'Agent' },
  { id: 'tools', label: 'Tools' },
  { id: 'memory', label: 'Memory' },
  { id: 'checkpoints', label: 'Checkpoints' },
  { id: 'agent-access', label: 'Agent Access' },
  { id: 'agent-teams', label: 'Agent Teams' },
  { id: 'settings', label: 'Settings' },
]

/** The persistent nav shown on every view. */
export function renderNavShellHtml(): string {
  const items = APP_NAV_ENTRIES.map(
    (entry) =>
      `<button type="button" class="nav-item" data-nav="${entry.id}" onclick="navigateTo('${entry.id}')">${entry.label}</button>`,
  ).join('')

  return `<nav class="app-nav" aria-label="SymbolWright navigation">${items}</nav>`
}
