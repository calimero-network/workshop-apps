// Single source of truth for app naming, theme, and service identifiers.
//
// Vite imports JSON natively, so this is a thin typed re-export of
// `studio.config.json` — edit *that* file when renaming services or
// retheming, not strings scattered across components.

import raw from '../../studio.config.json';

export interface ServiceEntry {
  /** Stable id from the spec. Keys the services map; used by the frontend to
   *  look up a service's wire name. NOT positionally inferred. */
  id: string;
  /** Wire name passed to `mero.admin.createContext({ serviceName })` and the
   *  bundle manifest service entry. Must match the Cargo crate's domain
   *  identity. The generated client lives at `src/api/<name>/`. */
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
    preset?: string;
    /** Preset's default light/dark mode — seeds first paint when the user
     *  has no stored choice, so the shipped app matches the studio preview. */
    defaultMode?: 'light' | 'dark';
  };
  services: ServiceEntry[];
}

const config: StudioConfig = raw as unknown as StudioConfig;

export const APP_NAME = config.appName;
export const APP_ROUTE = config.metadata.route;
export const APP_PACKAGE = config.package;
export const APP_VERSION = config.appVersion;
export const APP_DISPLAY_NAME = config.metadata.name;
export const APP_DESCRIPTION = config.metadata.description;
export const THEME = config.theme;
export const THEME_PRESET: string = config.theme?.preset || 'arcade';

/** Per-preset default mode, mirroring core themePresets.js defaultMode (locked
 *  by themePresetParity.test.js). Fallback only: the studio always writes
 *  theme.defaultMode; this covers hand-edited configs missing the key, so a
 *  dark-first preset still boots dark like its preview. */
const PRESET_DEFAULT_MODE: Record<string, 'light' | 'dark'> = {
  arcade: 'dark', lounge: 'dark', paper: 'light', tide: 'dark', editorial: 'dark',
};

export const THEME_DEFAULT_MODE: 'light' | 'dark' =
  config.theme?.defaultMode === 'dark' || config.theme?.defaultMode === 'light'
    ? config.theme.defaultMode
    : Object.prototype.hasOwnProperty.call(PRESET_DEFAULT_MODE, THEME_PRESET)
      ? PRESET_DEFAULT_MODE[THEME_PRESET]
      : 'dark';
export const LAYOUT_PRESET: string = (raw as any).layoutPreset || 'centered-tool';
export const TOPOLOGY = (raw as any).topology || null;

/** All declared services, in config order. One generated client per entry. */
export const SERVICES: ServiceEntry[] = config.services;

/** The primary (first) service. Single-context apps have exactly one; the
 *  neutral foundation is single-context. Throws at startup if none declared so
 *  a misconfigured studio.config.json fails loudly instead of producing
 *  `undefined` downstream. */
export const PRIMARY_SERVICE: ServiceEntry = (() => {
  const svc = config.services[0];
  if (!svc) throw new Error('studio.config.json: services[] is empty');
  return svc;
})();

/** Look up a declared service by its spec `id`. Throws if absent. */
export function requireService(id: string): ServiceEntry {
  const svc = config.services.find((s) => s.id === id);
  if (!svc) {
    throw new Error(`studio.config.json: services[] missing entry for id="${id}"`);
  }
  return svc;
}
