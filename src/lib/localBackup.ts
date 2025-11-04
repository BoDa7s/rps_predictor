const READ_ONLY_KEY = "rps_local_backup_readonly_v1";

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

export function markLocalBackupReadOnly(): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(READ_ONLY_KEY, "1");
  } catch {
    // ignore storage failures
  }
}

export function clearLocalBackupReadOnly(): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.removeItem(READ_ONLY_KEY);
  } catch {
    // ignore storage failures
  }
}

export function isLocalBackupReadOnly(): boolean {
  if (!isBrowser()) return false;
  try {
    return window.localStorage.getItem(READ_ONLY_KEY) === "1";
  } catch {
    return false;
  }
}

export const LOCAL_BACKUP_READ_ONLY_KEY = READ_ONLY_KEY;
