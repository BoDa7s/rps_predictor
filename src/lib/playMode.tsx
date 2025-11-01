import React, { createContext, useContext, useEffect, useMemo, useState } from "react";

export type PlayMode = "local" | "cloud";

interface PlayModeContextValue {
  mode: PlayMode;
  setMode: (mode: PlayMode) => void;
}

const DEFAULT_MODE: PlayMode = "local";
const PlayModeContext = createContext<PlayModeContextValue | null>(null);
const PLAY_MODE_CACHE_KEY = "rps_play_mode";

type StorageLike = Pick<Storage, "getItem" | "setItem">;

function getSessionStorage(): StorageLike | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function readCachedMode(): PlayMode {
  const storage = getSessionStorage();
  if (!storage) return DEFAULT_MODE;
  const cached = storage.getItem(PLAY_MODE_CACHE_KEY);
  return cached === "cloud" ? "cloud" : DEFAULT_MODE;
}

function writeCachedMode(mode: PlayMode) {
  const storage = getSessionStorage();
  if (!storage) return;
  try {
    storage.setItem(PLAY_MODE_CACHE_KEY, mode);
  } catch {
    // ignore write failures; mode will fall back to default on next load
  }
}

export function PlayModeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<PlayMode>(() => readCachedMode());

  useEffect(() => {
    writeCachedMode(mode);
  }, [mode]);

  const value = useMemo<PlayModeContextValue>(
    () => ({
      mode,
      setMode: setModeState,
    }),
    [mode],
  );

  return <PlayModeContext.Provider value={value}>{children}</PlayModeContext.Provider>;
}

export function usePlayMode(): PlayModeContextValue {
  const ctx = useContext(PlayModeContext);
  if (!ctx) {
    throw new Error("usePlayMode must be used within a PlayModeProvider");
  }
  return ctx;
}

export function getCachedPlayMode(): PlayMode {
  return readCachedMode();
}

export { PLAY_MODE_CACHE_KEY };
