/** Every route id the unified app shell's nav can show. */
export const APP_SHELL_ROUTE_IDS = [
  'dashboard',
  'missions',
  'workspace',
  'agent',
  'tools',
  'memory',
  'checkpoints',
  'settings',
  'repository',
] as const

export type AppShellRouteId = (typeof APP_SHELL_ROUTE_IDS)[number]

export const DEFAULT_APP_SHELL_ROUTE: AppShellRouteId = 'dashboard'

/**
 * Builds the hash-based client router for the unified app shell. Every
 * view's markup is already present in the DOM as a sibling
 * `<section data-view="...">`; the router only toggles visibility and calls
 * a per-view init hook on first (or repeat) entry — no virtual DOM, no
 * bundler, consistent with the rest of CodeMind's zero-dependency
 * server-rendered client scripts.
 *
 * Hash-based routing (not the History API) was chosen deliberately: the
 * whole app is one static shell document, so a hash router needs zero
 * server-side route awareness for deep links — `GET /` always serves the
 * same shell and the router picks up whatever `#/view` follows.
 */
export function buildClientRouterScript(): string {
  return `
    const ROUTER_VIEWS = ${JSON.stringify(APP_SHELL_ROUTE_IDS)};
    const ROUTER_DEFAULT_VIEW = ${JSON.stringify(DEFAULT_APP_SHELL_ROUTE)};
    const routerViewInitializers = {};

    function registerRouterViewInit(viewId, fn) {
      routerViewInitializers[viewId] = fn;
    }

    function currentRouteId() {
      const raw = (window.location.hash || '#/' + ROUTER_DEFAULT_VIEW).slice(2);
      return ROUTER_VIEWS.includes(raw) ? raw : ROUTER_DEFAULT_VIEW;
    }

    function renderRoute() {
      const id = currentRouteId();
      document.querySelectorAll('[data-view]').forEach((section) => {
        section.style.display = section.getAttribute('data-view') === id ? 'block' : 'none';
      });
      document.querySelectorAll('[data-nav]').forEach((button) => {
        button.classList.toggle('active', button.getAttribute('data-nav') === id);
      });
      const init = routerViewInitializers[id];
      if (typeof init === 'function') init();
    }

    function navigateTo(viewId) {
      if (window.location.hash === '#/' + viewId) {
        renderRoute();
        return;
      }
      window.location.hash = '#/' + viewId;
    }

    window.addEventListener('hashchange', renderRoute);
  `
}
