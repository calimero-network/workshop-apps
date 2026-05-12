// Single source of truth for app naming, theme, and service identifiers.
//
// Vite imports JSON natively, so this is a thin typed re-export of
// `studio.config.json` — edit *that* file when renaming services or
// retheming, not strings scattered across components.

import raw from '../../studio.config.json';

interface ServiceEntry {
  /** Stable role: e.g. "directory" (workspace-level) or "instance" (per-context).
   *  Optional — single-service configs may omit it. */
  id?: string;
  /** Wire name passed to `mero.admin.createContext({ serviceName })` and the
   *  bundle manifest service entry. Must match the Cargo crate's domain
   *  identity (typically the directory name under `logic/crates/`). */
  name: string;
  /** Cargo `[package].name` for this service. */
  crate: string;
}

interface StudioConfig {
  appName: string;
  appVersion: string;
  package: string;
  metadata: {
    name: string;
    description: string;
    author?: string;
    /** Path the main page lives at — used by App.tsx routes. */
    route: string;
  };
  theme: {
    primaryColor: string;
    accentColor: string;
    style: string;
  };
  services: ServiceEntry[];
}

const config: StudioConfig = raw as StudioConfig;

export const APP_NAME = config.appName;
export const APP_ROUTE = config.metadata.route;
export const APP_PACKAGE = config.package;
export const APP_VERSION = config.appVersion;
export const APP_DISPLAY_NAME = config.metadata.name;
export const APP_DESCRIPTION = config.metadata.description;
export const THEME = config.theme;

const byId = (id: string) => config.services.find((s) => s.id === id);

/** Maps service-role id → wire name (`serviceName` for createContext etc.).
 *  For single-service configs where entries lack an `id`, falls back to the
 *  first declared service so the rest of the app continues to work unchanged. */
function requireService(id: string): string {
  const svc = byId(id);
  if (svc) return svc.name;
  // Single-service fallback: if only one service is declared and no id matches,
  // use it rather than crashing at startup.
  if (config.services.length === 1) return config.services[0].name;
  throw new Error(`studio.config.json: services[] missing entry for id="${id}"`);
}

export const SERVICE_NAME = {
  /** Workspace-level service (lobby in chat): names, presence, directory listing. */
  get directory(): string { return requireService('directory'); },
  /** Per-context service (room in chat): the actual per-instance state. */
  get instance(): string | null {
    const svc = byId('instance');
    return svc ? svc.name : null;
  },
};

/** localStorage key for persisting the selected namespace, scoped per-app. */
export const SELECTED_NAMESPACE_KEY = `${APP_NAME}:selectedNamespaceId`;

/** Default workspace name used when the user creates one without naming it. */
export const DEFAULT_WORKSPACE_NAME = `${APP_NAME}-lobby`;
