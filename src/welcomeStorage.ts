export const LOCAL_ACCOUNTS_KEY = "rps_local_accounts_v1";
export const LOCAL_ACTIVE_ACCOUNT_KEY = "rps_local_active_account_v1";

interface ClearOptions {
  clearAccounts?: boolean;
}

export function clearWelcomeStorage(options?: ClearOptions): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.removeItem(LOCAL_ACTIVE_ACCOUNT_KEY);
  } catch {
    /* noop */
  }
  if (options?.clearAccounts) {
    try {
      window.localStorage.removeItem(LOCAL_ACCOUNTS_KEY);
    } catch {
      /* noop */
    }
  }
}
