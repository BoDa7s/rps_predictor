import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

type LocalModeContextValue = {
  localModeEnabled: boolean;
  setLocalModeEnabled: (enabled: boolean) => void;
  localModeAvailable: boolean;
  hostname: string;
};

const LocalModeContext = createContext<LocalModeContextValue | undefined>(undefined);

function resolveHostname(): string {
  if (typeof window === "undefined") {
    return "";
  }
  return window.location.hostname;
}

function isLocalhostHostname(hostname: string): boolean {
  if (!hostname) return false;
  if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]") {
    return true;
  }
  return hostname.endsWith(".localhost");
}

export function LocalModeProvider({ children }: { children: React.ReactNode }): JSX.Element {
  const [localModeEnabled, setLocalModeEnabledState] = useState(false);
  const [hostname, setHostname] = useState<string>(() => resolveHostname());

  const localModeAvailable = isLocalhostHostname(hostname);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const updateHostname = () => {
      setHostname(resolveHostname());
    };

    updateHostname();
    window.addEventListener("visibilitychange", updateHostname);
    window.addEventListener("focus", updateHostname);

    return () => {
      window.removeEventListener("visibilitychange", updateHostname);
      window.removeEventListener("focus", updateHostname);
    };
  }, []);

  useEffect(() => {
    if (!localModeAvailable && localModeEnabled) {
      setLocalModeEnabledState(false);
    }
  }, [localModeAvailable, localModeEnabled]);

  const setLocalModeEnabled = useCallback(
    (enabled: boolean) => {
      if (!localModeAvailable) {
        setLocalModeEnabledState(false);
        return;
      }
      setLocalModeEnabledState(enabled);
    },
    [localModeAvailable],
  );

  const value = useMemo(
    () => ({ localModeEnabled, setLocalModeEnabled, localModeAvailable, hostname }),
    [localModeEnabled, setLocalModeEnabled, localModeAvailable, hostname],
  );

  return <LocalModeContext.Provider value={value}>{children}</LocalModeContext.Provider>;
}

export function useLocalMode(): LocalModeContextValue {
  const context = useContext(LocalModeContext);
  if (!context) {
    throw new Error("useLocalMode must be used within a LocalModeProvider");
  }
  return context;
}

