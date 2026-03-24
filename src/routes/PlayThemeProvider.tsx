import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { darken, getReadableTextColor, lighten, mixHexColors, normalizeHexColor } from "../colorUtils";
import {
  cloneProfilePreferences,
  DEFAULT_PROFILE_PREFERENCES,
  DEFAULT_THEME_COLOR_PREFERENCES,
  migrateLegacyThemeColorPreferences,
  type ThemeColorPreferences,
  type ThemeMode,
  type ThemeModeColors,
  type ThemePreference,
  useStats,
} from "../stats";

const THEME_PREFERENCE_STORAGE_KEY = "rps_theme_pref_v1";
const THEME_COLOR_STORAGE_KEY = "rps_theme_colors_v1";

type PartialThemeColorPreferences = Partial<Record<ThemeMode, Partial<ThemeModeColors>>>;

interface PlayThemeContextValue {
  themePreference: ThemePreference;
  resolvedThemeMode: ThemeMode;
  themeVariables: Record<string, string>;
  themeOptions: { value: ThemePreference; label: string }[];
  applyThemePreference: (value: ThemePreference) => void;
}

const PlayThemeContext = createContext<PlayThemeContextValue | null>(null);

function parseStoredThemeColors(raw: string | null): ThemeColorPreferences | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as PartialThemeColorPreferences;
    if (!parsed || typeof parsed !== "object") {
      return null;
    }
    return migrateLegacyThemeColorPreferences(mergeThemeColorPreferences(DEFAULT_THEME_COLOR_PREFERENCES, parsed));
  } catch {
    return null;
  }
}

function mergeThemeColorPreferences(
  base: ThemeColorPreferences,
  override?: PartialThemeColorPreferences | ThemeColorPreferences | null,
): ThemeColorPreferences {
  const result: ThemeColorPreferences = {
    light: { ...base.light },
    dark: { ...base.dark },
  };

  if (!override) {
    return result;
  }

  (Object.keys(override) as ThemeMode[]).forEach(mode => {
    if (!override[mode]) return;
    const next = override[mode]!;
    if (next.accent) {
      result[mode].accent = normalizeHexColor(next.accent, result[mode].accent);
    }
    if (next.background) {
      result[mode].background = normalizeHexColor(next.background, result[mode].background);
    }
  });

  return result;
}

function useMediaQuery(query: string): boolean {
  const getMatch = () => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return false;
    }
    return window.matchMedia(query).matches;
  };

  const [matches, setMatches] = useState<boolean>(() => getMatch());

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }
    const mediaQuery = window.matchMedia(query);
    const handleChange = (event: MediaQueryListEvent) => setMatches(event.matches);
    setMatches(mediaQuery.matches);
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, [query]);

  return matches;
}

function deriveThemeCssVariables(mode: ThemeMode, colors: ThemeModeColors): Record<string, string> {
  const defaults = DEFAULT_THEME_COLOR_PREFERENCES[mode];
  const accent = normalizeHexColor(colors.accent, defaults.accent);
  const background = normalizeHexColor(colors.background, defaults.background);
  const accentStrong = mode === "dark" ? lighten(accent, 0.14) : darken(accent, 0.22);
  const accentHover = mode === "dark" ? lighten(accent, 0.08) : darken(accent, 0.1);
  const accentActive = mode === "dark" ? darken(accent, 0.14) : darken(accent, 0.18);
  const accentSoft = mode === "dark" ? mixHexColors(background, accent, 0.22) : mixHexColors("#FFFFFF", accent, 0.14);
  const accentMuted = mode === "dark" ? mixHexColors(background, accent, 0.36) : mixHexColors(background, accent, 0.16);
  const onAccent = getReadableTextColor(accent, "#F8FAFC", "#0B1220");
  const textStrong = mode === "dark" ? mixHexColors(background, "#FFFFFF", 0.92) : mixHexColors(background, "#000000", 0.9);
  const textPrimary = mode === "dark" ? mixHexColors(background, "#FFFFFF", 0.84) : mixHexColors(background, "#000000", 0.78);
  const textSecondary = mode === "dark" ? mixHexColors(background, "#FFFFFF", 0.68) : mixHexColors(background, "#000000", 0.62);
  const textMuted = mode === "dark" ? mixHexColors(background, "#FFFFFF", 0.54) : mixHexColors(background, "#000000", 0.48);
  const surfaceCard =
    mode === "dark" ? mixHexColors(background, "#FFFFFF", 0.06) : mixHexColors("#FFFFFF", background, 0.18);
  const surfaceInput =
    mode === "dark" ? mixHexColors(background, "#FFFFFF", 0.1) : mixHexColors(background, "#FFFFFF", 0.42);
  const surfaceSubtle =
    mode === "dark" ? mixHexColors(background, accent, 0.09) : mixHexColors(background, accent, 0.05);
  const surfaceHover =
    mode === "dark" ? mixHexColors(background, "#FFFFFF", 0.15) : mixHexColors(background, accent, 0.1);
  const border = mode === "dark" ? mixHexColors(background, "#FFFFFF", 0.16) : mixHexColors(background, accent, 0.16);
  const borderStrong =
    mode === "dark" ? mixHexColors(background, accent, 0.28) : mixHexColors(background, accent, 0.28);
  const ring = mode === "dark" ? mixHexColors(accent, "#FFFFFF", 0.3) : mixHexColors(accent, "#FFFFFF", 0.18);
  const gradientStart = mode === "dark" ? mixHexColors(background, accent, 0.14) : mixHexColors(background, "#FFFFFF", 0.6);
  const gradientMiddle = mode === "dark" ? mixHexColors(background, accent, 0.06) : mixHexColors(background, accent, 0.03);
  const gradientEnd = mode === "dark" ? darken(background, 0.18) : mixHexColors("#FFFFFF", background, 0.08);
  const orbPrimary = mode === "dark" ? mixHexColors(accent, background, 0.28) : mixHexColors(accent, "#FFFFFF", 0.42);
  const orbSecondary = mode === "dark" ? mixHexColors(accent, background, 0.46) : mixHexColors(accent, background, 0.24);
  const orbTertiary = mode === "dark" ? mixHexColors(accent, background, 0.62) : mixHexColors(accent, background, 0.38);
  return {
    "--app-bg": background,
    "--app-accent": accent,
    "--app-accent-strong": accentStrong,
    "--app-accent-hover": accentHover,
    "--app-accent-active": accentActive,
    "--app-accent-soft": accentSoft,
    "--app-accent-muted": accentMuted,
    "--app-on-accent": onAccent,
    "--app-text-strong": textStrong,
    "--app-text-primary": textPrimary,
    "--app-text-secondary": textSecondary,
    "--app-text-muted": textMuted,
    "--app-surface-card": surfaceCard,
    "--app-surface-input": surfaceInput,
    "--app-surface-subtle": surfaceSubtle,
    "--app-surface-hover": surfaceHover,
    "--app-border": border,
    "--app-border-strong": borderStrong,
    "--app-ring": ring,
    "--app-gradient-start": gradientStart,
    "--app-gradient-middle": gradientMiddle,
    "--app-gradient-end": gradientEnd,
    "--app-orb-primary": orbPrimary,
    "--app-orb-secondary": orbSecondary,
    "--app-orb-tertiary": orbTertiary,
    "--app-overlay": mode === "dark" ? "rgba(5, 10, 20, 0.72)" : "rgba(15, 23, 42, 0.14)",
    "--app-orb-opacity": mode === "dark" ? "0.3" : "0.48",
    "--app-surface-shadow":
      mode === "dark" ? "0 22px 54px rgba(2, 8, 23, 0.45)" : "0 18px 40px rgba(37, 99, 235, 0.08)",
  };
}

export default function PlayThemeProvider({ children }: { children: React.ReactNode }) {
  const { currentProfile, updateProfile } = useStats();
  const [fallbackThemePreference, setFallbackThemePreference] = useState<ThemePreference>(() => {
    if (typeof window === "undefined") return "system";
    try {
      const stored = window.localStorage.getItem(THEME_PREFERENCE_STORAGE_KEY);
      return stored === "dark" || stored === "light" || stored === "system" ? stored : "system";
    } catch {
      return "system";
    }
  });
  const [fallbackThemeColors, setFallbackThemeColors] = useState<ThemeColorPreferences>(() => {
    const defaults = cloneProfilePreferences(DEFAULT_PROFILE_PREFERENCES).themeColors;
    if (typeof window === "undefined") return defaults;
    try {
      const stored = window.localStorage.getItem(THEME_COLOR_STORAGE_KEY);
      return parseStoredThemeColors(stored) ?? defaults;
    } catch {
      return defaults;
    }
  });
  const systemPrefersDark = useMediaQuery("(prefers-color-scheme: dark)");

  const themePreference: ThemePreference = currentProfile?.preferences.theme ?? fallbackThemePreference;
  const resolvedThemeMode: ThemeMode =
    themePreference === "system" ? (systemPrefersDark ? "dark" : "light") : themePreference;

  useEffect(() => {
    const profileTheme = currentProfile?.preferences.theme;
    if (!profileTheme) return;
    setFallbackThemePreference(prev => (prev === profileTheme ? prev : profileTheme));
  }, [currentProfile?.preferences.theme]);

  useEffect(() => {
    const profileColors = currentProfile?.preferences.themeColors;
    if (!profileColors || !currentProfile?.preferences) return;
    const cloned = cloneProfilePreferences(currentProfile.preferences).themeColors;
    setFallbackThemeColors(prev => {
      const prevSerialized = JSON.stringify(prev);
      const nextSerialized = JSON.stringify(cloned);
      return prevSerialized === nextSerialized ? prev : cloned;
    });
  }, [currentProfile?.preferences, currentProfile?.preferences.themeColors]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(THEME_PREFERENCE_STORAGE_KEY, themePreference);
      window.localStorage.setItem(THEME_COLOR_STORAGE_KEY, JSON.stringify(fallbackThemeColors));
    } catch {
      /* noop */
    }
  }, [fallbackThemeColors, themePreference]);

  const mergedThemeColors = useMemo(() => {
    const withFallback = mergeThemeColorPreferences(DEFAULT_THEME_COLOR_PREFERENCES, fallbackThemeColors);
    return currentProfile?.preferences.themeColors
      ? mergeThemeColorPreferences(withFallback, currentProfile.preferences.themeColors)
      : withFallback;
  }, [currentProfile?.preferences.themeColors, fallbackThemeColors]);

  const themeVariables = useMemo(
    () => deriveThemeCssVariables(resolvedThemeMode, mergedThemeColors[resolvedThemeMode]),
    [mergedThemeColors, resolvedThemeMode],
  );

  const themeOptions = useMemo(
    () => [
      { value: "dark" as ThemePreference, label: "Dark" },
      { value: "light" as ThemePreference, label: "Light" },
      { value: "system" as ThemePreference, label: `System (${systemPrefersDark ? "Dark" : "Light"})` },
    ],
    [systemPrefersDark],
  );

  const applyThemePreference = (value: ThemePreference) => {
    setFallbackThemePreference(prev => (prev === value ? prev : value));
    if (currentProfile) {
      const nextPreferences = cloneProfilePreferences(currentProfile.preferences);
      nextPreferences.theme = value;
      updateProfile(currentProfile.id, { preferences: nextPreferences });
    }
  };

  const contextValue = useMemo<PlayThemeContextValue>(
    () => ({
      themePreference,
      resolvedThemeMode,
      themeVariables,
      themeOptions,
      applyThemePreference,
    }),
    [resolvedThemeMode, themeOptions, themePreference, themeVariables],
  );

  return <PlayThemeContext.Provider value={contextValue}>{children}</PlayThemeContext.Provider>;
}

export function usePlayTheme() {
  const ctx = useContext(PlayThemeContext);
  if (!ctx) {
    throw new Error("usePlayTheme must be used within PlayThemeProvider");
  }
  return ctx;
}
