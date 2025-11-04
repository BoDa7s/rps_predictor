const LEGACY_READ_ONLY_KEY = "rps_local_backup_readonly_v1";
const MIGRATED_PROFILES_KEY = "rps_migrated_profiles_v1";

type MigratedProfilesMap = Record<string, boolean>;

let cachedMigratedProfiles: MigratedProfilesMap | null = null;

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

function readMigratedProfiles(): MigratedProfilesMap {
  if (!isBrowser()) {
    cachedMigratedProfiles = cachedMigratedProfiles ?? {};
    return cachedMigratedProfiles;
  }
  if (cachedMigratedProfiles) {
    return cachedMigratedProfiles;
  }
  try {
    const raw = window.localStorage.getItem(MIGRATED_PROFILES_KEY);
    if (!raw) {
      cachedMigratedProfiles = {};
      return cachedMigratedProfiles;
    }
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      cachedMigratedProfiles = {};
      return cachedMigratedProfiles;
    }
    const normalized: MigratedProfilesMap = {};
    Object.keys(parsed as Record<string, unknown>).forEach(key => {
      if (typeof key === "string" && key) {
        const value = (parsed as Record<string, unknown>)[key];
        if (value === true || value === "true" || value === 1 || value === "1") {
          normalized[key] = true;
        }
      }
    });
    cachedMigratedProfiles = normalized;
    return normalized;
  } catch {
    cachedMigratedProfiles = {};
    return cachedMigratedProfiles;
  }
}

function writeMigratedProfiles(map: MigratedProfilesMap): void {
  cachedMigratedProfiles = map;
  if (!isBrowser()) return;
  try {
    const keys = Object.keys(map);
    if (keys.length === 0) {
      window.localStorage.removeItem(MIGRATED_PROFILES_KEY);
    } else {
      window.localStorage.setItem(MIGRATED_PROFILES_KEY, JSON.stringify(map));
    }
  } catch {
    // ignore storage failures
  }
}

function clearLegacyReadOnlyFlag(): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.removeItem(LEGACY_READ_ONLY_KEY);
  } catch {
    // ignore storage failures
  }
}

export function ensureLegacyReadOnlyFlagCleared(): void {
  clearLegacyReadOnlyFlag();
}

export function isProfileMigrated(profileId: string | null | undefined): boolean {
  if (!profileId) return false;
  const map = readMigratedProfiles();
  return Boolean(map[profileId]);
}

export function getMigratedProfileIds(): string[] {
  const map = readMigratedProfiles();
  return Object.keys(map);
}

export function markProfileMigrated(profileId: string): void {
  if (!profileId) return;
  const map = { ...readMigratedProfiles(), [profileId]: true };
  writeMigratedProfiles(map);
}

export function unmarkProfileMigrated(profileId: string): void {
  if (!profileId) return;
  const map = { ...readMigratedProfiles() };
  if (!map[profileId]) return;
  delete map[profileId];
  writeMigratedProfiles(map);
}

if (isBrowser()) {
  clearLegacyReadOnlyFlag();
}

export const MIGRATED_PROFILES_STORAGE_KEY = MIGRATED_PROFILES_KEY;
export const LEGACY_LOCAL_BACKUP_KEY = LEGACY_READ_ONLY_KEY;
