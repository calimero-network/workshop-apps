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
 *  Falls back to the first declared service when a named role is absent —
 *  single-service apps like one-on-one-chat have no explicit id fields in
 *  studio.config.json, but their sole entry IS the primary context service. */
function requireService(id: string): string {
  const svc = byId(id) ?? config.services[0];
  if (!svc) {
    throw new Error(`studio.config.json: services[] missing entry for id="${id}" and no fallback service found`);
  }
  return svc.name;
}

export const SERVICE_NAME = {
  /** Primary context service (chat for one-on-one-chat; lobby for multi-room). */
  get directory(): string { return requireService('directory'); },
  /** Per-context service: present only in multi-service specs. */
  get instance(): string | null {
    const svc = byId('instance');
    return svc ? svc.name : null;
  },
};

/** localStorage key for persisting the selected namespace, scoped per-app. */
export const SELECTED_NAMESPACE_KEY = `${APP_NAME}:selectedNamespaceId`;

/** Default workspace name used when the user creates one without naming it. */
export const DEFAULT_WORKSPACE_NAME = `${APP_NAME}-lobby`;
