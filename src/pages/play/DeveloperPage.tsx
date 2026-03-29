import React, { useCallback, useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { DeveloperConsole } from "../../DeveloperConsole";
import { DEV_MODE_ENABLED } from "../../devMode";
import {
  MATCH_TIMING_DEFAULTS,
  type MatchTimings,
  clearSavedMatchTimings,
  loadMatchTimings,
  normalizeMatchTimings,
  saveMatchTimings,
} from "../../matchTimings";
import { PLAY_DASHBOARD_PATH } from "../../playEntry";
import { lockSecureStore } from "../../secureStore";

export default function DeveloperPage() {
  const navigate = useNavigate();
  const [entryReady, setEntryReady] = useState(false);
  const [matchTimings, setMatchTimings] = useState<MatchTimings>(() => normalizeMatchTimings(loadMatchTimings()));

  useEffect(() => {
    lockSecureStore();
    setEntryReady(true);
    return () => {
      lockSecureStore();
    };
  }, []);

  const updateMatchTimings = useCallback(
    (next: MatchTimings, options?: { persist?: boolean; clearSaved?: boolean }) => {
      const normalized = normalizeMatchTimings(next);
      setMatchTimings(normalized);
      if (options?.persist) {
        saveMatchTimings(normalized);
      } else if (options?.clearSaved) {
        clearSavedMatchTimings();
      }
    },
    [],
  );

  const resetMatchTimings = useCallback(() => {
    const defaults = normalizeMatchTimings(MATCH_TIMING_DEFAULTS);
    setMatchTimings(defaults);
    clearSavedMatchTimings();
  }, []);

  if (!DEV_MODE_ENABLED) {
    return <Navigate to={PLAY_DASHBOARD_PATH} replace />;
  }

  if (!entryReady) {
    return null;
  }

  return (
    <section className="min-h-0">
      <DeveloperConsole
        open
        onClose={() => {
          lockSecureStore();
          navigate(PLAY_DASHBOARD_PATH);
        }}
        timings={matchTimings}
        onTimingsUpdate={updateMatchTimings}
        onTimingsReset={resetMatchTimings}
        layoutMode="page"
        closeLabel="Back to Dashboard"
      />
    </section>
  );
}
