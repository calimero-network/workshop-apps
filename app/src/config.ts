// Single source of truth for app naming, theme, and service identifiers.
//
// Vite imports JSON natively, so this is a thin typed re-export of
// `studio.config.json` — edit *that* file when renaming services or
// retheming, not strings scattered across components.

import raw from '../../studio.config.json';

interface ServiceEntry {
  /** Stable role: e.g. "directory" (workspace-level) or "instance" (per-context). */
  id: string;
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
 *  Throws at startup if a referenced role isn't declared, so a misconfigured
 *  studio.config.json fails loudly instead of silently producing `undefined`. */
function requireService(id: string): string {
  const svc = byId(id);
  if (!svc) {
    throw new Error(`studio.config.json: services[] missing entry for id="${id}"`);
  }
  return svc.name;
}

export const SERVICE_NAME = {
  /** Workspace-level service: the primary (or only) service for this app.
   *  Falls back to the first declared service when no entry has id="directory"
   *  (single-service apps that declare services without explicit id fields). */
  get directory(): string {
    const byRole = byId('directory');
    if (byRole) return byRole.name;
    // Single-service fallback: the first entry in the services array IS the workspace service.
    const first = (raw as StudioConfig).services[0];
    if (first) return first.name;
    throw new Error('studio.config.json: services[] is empty — at least one service is required');
  },
  /** Per-context service (per-instance state). Null for single-service specs. */
  get instance(): string | null {
    const svc = byId('instance');
    return svc ? svc.name : null;
  },
};

/** localStorage key for persisting the selected namespace, scoped per-app. */
export const SELECTED_NAMESPACE_KEY = `${APP_NAME}:selectedNamespaceId`;

/** Default workspace name used when the user creates one without naming it. */
export const DEFAULT_WORKSPACE_NAME = `${APP_NAME}-lobby`;
