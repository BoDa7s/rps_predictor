import React, { useCallback, useEffect, useMemo, useState } from "react";
import { DEV_MODE_ENABLED, DEV_MODE_SECURE } from "./devMode";
import { usePlayers } from "./players";
import type { PlayerProfile } from "./players";
import { useStats } from "./stats";
import type { MatchSummary, RoundLog } from "./stats";
import { MatchTimings, MATCH_TIMING_DEFAULTS, normalizeMatchTimings } from "./matchTimings";
import {
  appendAuditEntry,
  AuditEntry,
  isUnlocked,
  loadAuditLog,
  loadDatasetSnapshot,
  saveDatasetSnapshot,
  subscribeSecure,
  unlockWithPin,
} from "./secureStore";

function cloneTimings(value: MatchTimings): MatchTimings {
  return {
    challenge: { ...value.challenge },
    practice: { ...value.practice },
  };
}

interface DeveloperConsoleProps {
  open: boolean;
  onClose: () => void;
  timings: MatchTimings;
  onTimingsUpdate: (timings: MatchTimings, options?: { persist?: boolean; clearSaved?: boolean }) => void;
  onTimingsReset: () => void;
}

const TAB_OPTIONS = ["overview", "players", "rounds", "matches", "timers", "audit"] as const;
type TabKey = typeof TAB_OPTIONS[number];
type TimingField = keyof MatchTimings["challenge"];

export function DeveloperConsole({ open, onClose, timings, onTimingsUpdate, onTimingsReset }: DeveloperConsoleProps) {
  const { players, updatePlayer, deletePlayer } = usePlayers();
  const {
    adminRounds,
    adminMatches,
    adminProfiles,
    adminUpdateRound,
    adminDeleteRound,
    adminUpdateMatch,
    adminDeleteMatch,
  } = useStats();
  const [tab, setTab] = useState<TabKey>("overview");
  const [pin, setPin] = useState("");
  const [unlockError, setUnlockError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [auditLogs, setAuditLogs] = useState<AuditEntry[]>([]);
  const [ready, setReady] = useState(() => (typeof window === "undefined" ? false : isUnlocked()));
  const [snapshotSavedAt, setSnapshotSavedAt] = useState<string | null>(null);
  const [timingDraft, setTimingDraft] = useState<MatchTimings>(() => cloneTimings(timings));
  const [makeDefault, setMakeDefault] = useState(false);

  const timerFields = useMemo(
    () => [
      { key: "countdownTickMs" as TimingField, label: "Countdown tick (ms)", helper: "Delay between countdown numbers." },
      { key: "revealHoldMs" as TimingField, label: "AI reveal hold (ms)", helper: "Pause between reveal and score resolution." },
      { key: "resultBannerMs" as TimingField, label: "Result banner (ms)", helper: "Hold duration before the next round begins." },
    ],
    []
  );

  useEffect(() => {
    if (!open) return;
    const unsubscribe = subscribeSecure(() => {
      const unlocked = isUnlocked();
      setReady(unlocked);
      if (unlocked) {
        loadAuditLog().then(setAuditLogs).catch(() => setAuditLogs([]));
        if (DEV_MODE_SECURE) {
          loadDatasetSnapshot<{ savedAt?: string }>({ savedAt: undefined })
            .then(data => {
              if (data?.savedAt) setSnapshotSavedAt(data.savedAt);
            })
            .catch(() => setSnapshotSavedAt(null));
        } else {
          setSnapshotSavedAt(null);
        }
      }
    });
    if (isUnlocked()) {
      loadAuditLog().then(setAuditLogs).catch(() => setAuditLogs([]));
      if (DEV_MODE_SECURE) {
        loadDatasetSnapshot<{ savedAt?: string }>({ savedAt: undefined })
          .then(data => {
            if (data?.savedAt) setSnapshotSavedAt(data.savedAt);
          })
          .catch(() => setSnapshotSavedAt(null));
      } else {
        setSnapshotSavedAt(null);
      }
    }
    return unsubscribe;
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setTimingDraft(cloneTimings(timings));
    setMakeDefault(false);
  }, [timings, open]);

  useEffect(() => {
    if (!open || !ready || !DEV_MODE_SECURE) return;
    const payload = {
      savedAt: new Date().toISOString(),
      players,
      rounds: adminRounds,
      matches: adminMatches,
      profiles: adminProfiles,
    };
    saveDatasetSnapshot(payload)
      .then(() => setSnapshotSavedAt(payload.savedAt))
      .catch(err => console.error("Failed to persist developer snapshot", err));
  }, [open, ready, players, adminRounds, adminMatches, adminProfiles]);

  const overview = useMemo(() => {
    const totalRounds = adminRounds.length;
    const totalMatches = adminMatches.length;
    const byPlayer = new Map<string, { name: string; rounds: number; matches: number }>();
    adminRounds.forEach(r => {
      const ref = byPlayer.get(r.playerId) || { name: r.playerId, rounds: 0, matches: 0 };
      ref.rounds += 1;
      byPlayer.set(r.playerId, ref);
    });
    adminMatches.forEach(m => {
      const ref = byPlayer.get(m.playerId) || { name: m.playerId, rounds: 0, matches: 0 };
      ref.name = players.find(p => p.id === m.playerId)?.playerName || ref.name;
      ref.matches += 1;
      byPlayer.set(m.playerId, ref);
    });
    players.forEach(p => {
      const ref = byPlayer.get(p.id) || { name: p.playerName, rounds: 0, matches: 0 };
      ref.name = p.playerName;
      byPlayer.set(p.id, ref);
    });
    const distribution = Array.from(byPlayer.entries()).map(([playerId, stats]) => ({
      playerId,
      ...stats,
    }));
    return { totalRounds, totalMatches, distribution };
  }, [adminMatches, adminRounds, players]);

  const ensureAuditLoaded = useCallback(async () => {
    if (!isUnlocked()) return;
    const logs = await loadAuditLog();
    setAuditLogs(logs);
  }, []);

  const handleUnlock = useCallback(async (event: React.FormEvent) => {
    event.preventDefault();
    setUnlockError(null);
    setLoading(true);
    try {
      const success = await unlockWithPin(pin.trim());
      if (!success) {
        setUnlockError("Invalid PIN");
      } else {
        setPin("");
        await ensureAuditLoaded();
      }
    } catch (err) {
      console.error(err);
      setUnlockError("Unable to unlock store");
    } finally {
      setLoading(false);
    }
  }, [pin, ensureAuditLoaded]);

  const recordAudit = useCallback(async (entry: Omit<AuditEntry, "timestamp">) => {
    const fullEntry: AuditEntry = {
      timestamp: new Date().toISOString(),
      ...entry,
    };
    await appendAuditEntry(fullEntry);
    setAuditLogs(prev => prev.concat(fullEntry));
  }, []);

  const handlePlayerUpdate = useCallback(async (id: string, patch: Record<string, unknown>) => {
    updatePlayer(id, patch);
    await recordAudit({ action: "update-player", target: id, notes: JSON.stringify(patch) });
  }, [recordAudit, updatePlayer]);

  const handlePlayerDelete = useCallback(async (id: string) => {
    deletePlayer(id);
    await recordAudit({ action: "delete-player", target: id });
  }, [deletePlayer, recordAudit]);

  const handleRoundUpdate = useCallback(async (id: string, patch: Partial<RoundLog>) => {
    adminUpdateRound(id, patch);
    await recordAudit({ action: "update-round", target: id, notes: JSON.stringify(patch) });
  }, [adminUpdateRound, recordAudit]);

  const handleRoundDelete = useCallback(async (id: string) => {
    adminDeleteRound(id);
    await recordAudit({ action: "delete-round", target: id });
  }, [adminDeleteRound, recordAudit]);

  const handleMatchUpdate = useCallback(async (id: string, patch: Partial<MatchSummary>) => {
    adminUpdateMatch(id, patch);
    await recordAudit({ action: "update-match", target: id, notes: JSON.stringify(patch) });
  }, [adminUpdateMatch, recordAudit]);

  const handleMatchDelete = useCallback(async (id: string) => {
    adminDeleteMatch(id);
    await recordAudit({ action: "delete-match", target: id });
  }, [adminDeleteMatch, recordAudit]);

  const handleTimingFieldChange = useCallback((mode: "challenge" | "practice", field: TimingField, raw: string) => {
    const nextValue = Number.parseFloat(raw);
    setTimingDraft(prev => {
      if (!Number.isFinite(nextValue)) return prev;
      const clamped = Math.max(1, Math.round(nextValue));
      if (prev[mode][field] === clamped) return prev;
      return {
        ...prev,
        [mode]: {
          ...prev[mode],
          [field]: clamped,
        },
      };
    });
  }, []);

  const handleTimingSubmit = useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const sanitized = normalizeMatchTimings(timingDraft);
      setTimingDraft(cloneTimings(sanitized));
      onTimingsUpdate(sanitized, { persist: makeDefault });
    },
    [timingDraft, makeDefault, onTimingsUpdate]
  );

  const handleRevertDraft = useCallback(() => {
    setTimingDraft(cloneTimings(timings));
    setMakeDefault(false);
  }, [timings]);

  const handleResetTimings = useCallback(() => {
    const defaults = normalizeMatchTimings(MATCH_TIMING_DEFAULTS);
    setTimingDraft(cloneTimings(defaults));
    setMakeDefault(false);
    onTimingsReset();
  }, [onTimingsReset]);

  if (!DEV_MODE_ENABLED || !open) return null;

  return (
    <div
      role="presentation"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(10, 15, 30, 0.72)",
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
      aria-hidden={false}
    >
      <div
        role="dialog"
        aria-modal="true"
        style={{
          width: "min(90vw, 1100px)",
          maxHeight: "90vh",
          background: "#0b1220",
          borderRadius: "16px",
          padding: "24px",
          color: "#f7fafc",
          boxShadow: "0 20px 60px rgba(0,0,0,0.45)",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          gap: "16px",
        }}
      >
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h2 style={{ fontSize: "1.25rem", margin: 0 }}>Developer Control Room</h2>
            <p style={{ margin: 0, fontSize: "0.85rem", opacity: 0.7 }}>
              Secure access to player demographics, gameplay statistics, and audit trails.
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "transparent",
              border: "1px solid rgba(255,255,255,0.2)",
              color: "inherit",
              borderRadius: "999px",
              padding: "6px 16px",
              cursor: "pointer",
            }}
          >
            Close
          </button>
        </header>

        {!ready ? (
          <form onSubmit={handleUnlock} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <p style={{ margin: 0, opacity: 0.8 }}>
              Enter the developer PIN to unlock secure tooling for protected data.
            </p>
            <label style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <span style={{ fontSize: "0.85rem", opacity: 0.7 }}>PIN</span>
              <input
                type="password"
                value={pin}
                onChange={e => setPin(e.target.value)}
                style={{
                  padding: "10px 12px",
                  borderRadius: "8px",
                  border: "1px solid rgba(255,255,255,0.2)",
                  background: "rgba(15,20,35,0.9)",
                  color: "inherit",
                }}
              />
            </label>
            {unlockError && <p style={{ color: "#f87171", margin: 0 }}>{unlockError}</p>}
            <button
              type="submit"
              disabled={!pin.trim() || loading}
              style={{
                alignSelf: "flex-start",
                background: "#2563eb",
                border: "none",
                color: "white",
                borderRadius: "8px",
                padding: "8px 18px",
                cursor: pin.trim() ? "pointer" : "not-allowed",
                opacity: loading ? 0.7 : 1,
              }}
            >
              {loading ? "Verifying..." : "Unlock"}
            </button>
          </form>
        ) : (
          <>
            <nav style={{ display: "flex", gap: "12px" }}>
              {TAB_OPTIONS.map(key => (
                <button
                  key={key}
                  onClick={() => setTab(key)}
                  style={{
                    background: tab === key ? "#1d4ed8" : "rgba(255,255,255,0.08)",
                    border: "none",
                    color: "white",
                    padding: "8px 14px",
                    borderRadius: "999px",
                    cursor: "pointer",
                    fontSize: "0.85rem",
                    textTransform: "capitalize",
                  }}
                >
                  {key}
                </button>
              ))}
            </nav>
            <section style={{ flex: 1, overflow: "auto", paddingRight: "4px" }}>
              {tab === "overview" && (
                <div style={{ display: "grid", gap: "16px" }}>
                  <div style={{ display: "flex", gap: "12px" }}>
                    <StatCard label="Players" value={players.length} />
                    <StatCard label="Profiles" value={adminProfiles.length} />
                    <StatCard label="Matches" value={overview.totalMatches} />
                    <StatCard label="Rounds" value={overview.totalRounds} />
                  </div>
                  <div style={{ background: "rgba(15,25,45,0.8)", borderRadius: "12px", padding: "16px" }}>
                    <h3 style={{ marginTop: 0 }}>Participation</h3>
                    {snapshotSavedAt && (
                      <p style={{ margin: "0 0 12px", fontSize: "0.75rem", opacity: 0.6 }}>
                        Secure snapshot saved {new Date(snapshotSavedAt).toLocaleString()}.
                      </p>
                    )}
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
                      <thead>
                        <tr style={{ textAlign: "left", opacity: 0.7 }}>
                          <th style={{ padding: "6px" }}>Player</th>
                          <th style={{ padding: "6px" }}>Rounds</th>
                          <th style={{ padding: "6px" }}>Matches</th>
                        </tr>
                      </thead>
                      <tbody>
                        {overview.distribution.map(item => (
                          <tr key={item.playerId} style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
                            <td style={{ padding: "6px" }}>{item.name}</td>
                            <td style={{ padding: "6px" }}>{item.rounds}</td>
                            <td style={{ padding: "6px" }}>{item.matches}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {tab === "players" && (
                <div style={{ display: "grid", gap: "16px" }}>
                  {players.map(player => (
                    <div
                      key={player.id}
                      style={{ background: "rgba(15,25,45,0.8)", borderRadius: "12px", padding: "16px", display: "grid", gap: "12px" }}
                    >
                      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <strong>{player.playerName}</strong>
                        <button
                          onClick={() => handlePlayerDelete(player.id)}
                          style={{
                            background: "rgba(239,68,68,0.15)",
                            border: "1px solid rgba(239,68,68,0.45)",
                            color: "#fca5a5",
                            borderRadius: "8px",
                            padding: "6px 12px",
                            cursor: "pointer",
                          }}
                        >
                          Delete
                        </button>
                      </header>
                      <PlayerEditor playerId={player.id} onUpdate={handlePlayerUpdate} player={player} />
                    </div>
                  ))}
                </div>
              )}

              {tab === "rounds" && (
                <RecordTable
                  data={adminRounds}
                  onDelete={handleRoundDelete}
                  onUpdate={handleRoundUpdate}
                  columns={["id", "playerId", "profileId", "t", "mode", "difficulty", "player", "ai", "outcome", "reason", "confidence"]}
                  title="Rounds"
                />
              )}

              {tab === "matches" && (
                <RecordTable
                  data={adminMatches}
                  onDelete={handleMatchDelete}
                  onUpdate={handleMatchUpdate}
                  columns={["id", "playerId", "profileId", "startedAt", "endedAt", "mode", "difficulty", "rounds", "notes"]}
                  title="Matches"
                />
              )}

              {tab === "timers" && (
                <form onSubmit={handleTimingSubmit} style={{ display: "grid", gap: "16px" }}>
                  <div
                    style={{
                      background: "rgba(15,25,45,0.8)",
                      borderRadius: "12px",
                      padding: "16px",
                      display: "grid",
                      gap: "16px",
                    }}
                  >
                    <div>
                      <h3 style={{ margin: "0 0 4px" }}>Match loop timings</h3>
                      <p style={{ margin: 0, fontSize: "0.8rem", opacity: 0.7 }}>
                        Update countdown, reveal, and banner durations. Apply changes for the current session or mark them as the
                        new default.
                      </p>
                    </div>
                    <div
                      style={{
                        display: "grid",
                        gap: "12px",
                        gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
                      }}
                    >
                      {(["challenge", "practice"] as const).map(mode => (
                        <fieldset
                          key={mode}
                          style={{
                            border: "1px solid rgba(255,255,255,0.12)",
                            borderRadius: "12px",
                            padding: "12px",
                            display: "grid",
                            gap: "12px",
                          }}
                        >
                          <legend style={{ padding: "0 8px", fontWeight: 600, textTransform: "capitalize" }}>{mode} mode</legend>
                          {timerFields.map(field => (
                            <label key={field.key} style={{ display: "grid", gap: "4px" }}>
                              <span style={{ fontSize: "0.85rem" }}>{field.label}</span>
                              <input
                                type="number"
                                min={100}
                                step={50}
                                value={timingDraft[mode][field.key]}
                                onChange={e => handleTimingFieldChange(mode, field.key, e.target.value)}
                                style={{
                                  padding: "8px 10px",
                                  borderRadius: "8px",
                                  border: "1px solid rgba(255,255,255,0.18)",
                                  background: "rgba(15,20,35,0.9)",
                                  color: "inherit",
                                }}
                              />
                              <span style={{ fontSize: "0.7rem", opacity: 0.6 }}>
                                Baseline {MATCH_TIMING_DEFAULTS[mode][field.key]} ms · {field.helper}
                              </span>
                            </label>
                          ))}
                        </fieldset>
                      ))}
                    </div>
                    <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "0.85rem" }}>
                      <input
                        type="checkbox"
                        checked={makeDefault}
                        onChange={e => setMakeDefault(e.target.checked)}
                      />
                      <span>Make these timings the default</span>
                    </label>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                      <button
                        type="submit"
                        style={{
                          background: "#2563eb",
                          border: "none",
                          color: "white",
                          borderRadius: "8px",
                          padding: "8px 18px",
                          cursor: "pointer",
                        }}
                      >
                        Save timings
                      </button>
                      <button
                        type="button"
                        onClick={handleRevertDraft}
                        style={{
                          background: "rgba(255,255,255,0.1)",
                          border: "1px solid rgba(255,255,255,0.15)",
                          color: "white",
                          borderRadius: "8px",
                          padding: "8px 14px",
                          cursor: "pointer",
                        }}
                      >
                        Revert to active
                      </button>
                      <button
                        type="button"
                        onClick={handleResetTimings}
                        style={{
                          background: "rgba(59,130,246,0.12)",
                          border: "1px solid rgba(59,130,246,0.4)",
                          color: "#93c5fd",
                          borderRadius: "8px",
                          padding: "8px 14px",
                          cursor: "pointer",
                        }}
                      >
                        Restore baseline defaults
                      </button>
                    </div>
                  </div>
                </form>
              )}

              {tab === "audit" && (
                <div style={{ background: "rgba(15,25,45,0.8)", borderRadius: "12px", padding: "16px" }}>
                  <h3 style={{ marginTop: 0 }}>Audit trail</h3>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
                    <thead>
                      <tr style={{ textAlign: "left", opacity: 0.7 }}>
                        <th style={{ padding: "6px" }}>Timestamp</th>
                        <th style={{ padding: "6px" }}>Action</th>
                        <th style={{ padding: "6px" }}>Target</th>
                        <th style={{ padding: "6px" }}>Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {auditLogs.map((entry, idx) => (
                        <tr key={idx} style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>
                          <td style={{ padding: "6px" }}>{new Date(entry.timestamp).toLocaleString()}</td>
                          <td style={{ padding: "6px" }}>{entry.action}</td>
                          <td style={{ padding: "6px" }}>{entry.target ?? "–"}</td>
                          <td style={{ padding: "6px", maxWidth: "320px", wordBreak: "break-word" }}>{entry.notes ?? ""}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div
      style={{
        flex: 1,
        background: "rgba(15,25,45,0.8)",
        borderRadius: "12px",
        padding: "16px",
        display: "flex",
        flexDirection: "column",
        gap: "4px",
      }}
    >
      <span style={{ fontSize: "0.8rem", opacity: 0.6 }}>{label}</span>
      <strong style={{ fontSize: "1.5rem" }}>{value}</strong>
    </div>
  );
}

interface PlayerEditorProps {
  playerId: string;
  player: PlayerProfile;
  onUpdate: (id: string, patch: Record<string, unknown>) => Promise<void>;
}

function PlayerEditor({ player, playerId, onUpdate }: PlayerEditorProps) {
  const [form, setForm] = useState(() => ({
    playerName: player.playerName,
    grade: player.grade,
    age: player.age != null ? String(player.age) : "",
    school: player.school ?? "",
    gender: player.gender ?? "",
    priorExperience: player.priorExperience ?? "",
  }));

  useEffect(() => {
    setForm({
      playerName: player.playerName,
      grade: player.grade,
      age: player.age != null ? String(player.age) : "",
      school: player.school ?? "",
      gender: player.gender ?? "",
      priorExperience: player.priorExperience ?? "",
    });
  }, [player]);

  const handleChange = (key: keyof typeof form, value: string) => {
    setForm(prev => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    const parsedAge = form.age ? Number.parseInt(form.age, 10) : undefined;
    await onUpdate(playerId, {
      playerName: form.playerName,
      grade: form.grade,
      age: Number.isFinite(parsedAge as number) ? parsedAge : undefined,
      school: form.school || undefined,
      gender: form.gender || undefined,
      priorExperience: form.priorExperience || undefined,
    });
  };

  return (
    <div style={{ display: "grid", gap: "8px" }}>
      <label style={{ display: "grid", gap: "4px" }}>
        <span style={{ fontSize: "0.75rem", opacity: 0.6 }}>Player name</span>
        <input
          type="text"
          value={form.playerName}
          onChange={e => handleChange("playerName", e.target.value)}
          style={{ padding: "8px 10px", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.2)", background: "rgba(8,13,25,0.8)", color: "inherit" }}
        />
      </label>
      <label style={{ display: "grid", gap: "4px" }}>
        <span style={{ fontSize: "0.75rem", opacity: 0.6 }}>Grade</span>
        <input
          type="text"
          value={form.grade}
          onChange={e => handleChange("grade", e.target.value)}
          style={{ padding: "8px 10px", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.2)", background: "rgba(8,13,25,0.8)", color: "inherit" }}
        />
      </label>
      <label style={{ display: "grid", gap: "4px" }}>
        <span style={{ fontSize: "0.75rem", opacity: 0.6 }}>Age</span>
        <input
          type="text"
          value={form.age}
          onChange={e => handleChange("age", e.target.value)}
          style={{ padding: "8px 10px", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.2)", background: "rgba(8,13,25,0.8)", color: "inherit" }}
        />
      </label>
      <label style={{ display: "grid", gap: "4px" }}>
        <span style={{ fontSize: "0.75rem", opacity: 0.6 }}>School</span>
        <input
          type="text"
          value={form.school}
          onChange={e => handleChange("school", e.target.value)}
          style={{ padding: "8px 10px", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.2)", background: "rgba(8,13,25,0.8)", color: "inherit" }}
        />
      </label>
      <label style={{ display: "grid", gap: "4px" }}>
        <span style={{ fontSize: "0.75rem", opacity: 0.6 }}>Gender</span>
        <input
          type="text"
          value={form.gender}
          onChange={e => handleChange("gender", e.target.value)}
          style={{ padding: "8px 10px", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.2)", background: "rgba(8,13,25,0.8)", color: "inherit" }}
        />
      </label>
      <label style={{ display: "grid", gap: "4px" }}>
        <span style={{ fontSize: "0.75rem", opacity: 0.6 }}>Prior experience</span>
        <input
          type="text"
          value={form.priorExperience}
          onChange={e => handleChange("priorExperience", e.target.value)}
          style={{ padding: "8px 10px", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.2)", background: "rgba(8,13,25,0.8)", color: "inherit" }}
        />
      </label>
      <button
        onClick={handleSave}
        style={{
          justifySelf: "flex-start",
          background: "#22c55e",
          border: "none",
          color: "#052e16",
          borderRadius: "8px",
          padding: "6px 14px",
          cursor: "pointer",
        }}
      >
        Save changes
      </button>
    </div>
  );
}

interface RecordTableProps<T> {
  data: T[];
  columns: (keyof T & string)[];
  title: string;
  onUpdate: (id: string, patch: Partial<T>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

function RecordTable<T extends { id: string }>({ data, columns, title, onUpdate, onDelete }: RecordTableProps<T>) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [buffer, setBuffer] = useState<Partial<T>>({});

  const startEdit = (row: T) => {
    setEditingId(row.id);
    setBuffer(row);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setBuffer({});
  };

  const commitEdit = async () => {
    if (!editingId) return;
    await onUpdate(editingId, buffer);
    setEditingId(null);
    setBuffer({});
  };

  return (
    <div style={{ background: "rgba(15,25,45,0.8)", borderRadius: "12px", padding: "16px" }}>
      <h3 style={{ marginTop: 0 }}>{title}</h3>
      <div style={{ maxHeight: "55vh", overflow: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }}>
          <thead>
            <tr style={{ textAlign: "left", opacity: 0.7 }}>
              {columns.map(col => (
                <th key={col} style={{ padding: "6px" }}>{col}</th>
              ))}
              <th style={{ padding: "6px" }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {data.map(row => (
              <tr key={row.id} style={{ borderTop: "1px solid rgba(255,255,255,0.07)" }}>
                {columns.map(col => (
                  <td key={col} style={{ padding: "6px", minWidth: "140px" }}>
                    {editingId === row.id ? (
                      <input
                        style={{
                          width: "100%",
                          padding: "4px 6px",
                          borderRadius: "6px",
                          border: "1px solid rgba(255,255,255,0.2)",
                          background: "rgba(8,13,25,0.8)",
                          color: "inherit",
                        }}
                        value={String((buffer as any)[col] ?? "")}
                        onChange={e => setBuffer(prev => ({ ...prev, [col]: e.target.value as any }))}
                      />
                    ) : (
                      <span style={{ wordBreak: "break-word" }}>{String((row as any)[col] ?? "")}</span>
                    )}
                  </td>
                ))}
                <td style={{ padding: "6px" }}>
                  {editingId === row.id ? (
                    <div style={{ display: "flex", gap: "8px" }}>
                      <button
                        onClick={commitEdit}
                        style={{ background: "#22c55e", border: "none", color: "#052e16", borderRadius: "6px", padding: "4px 10px", cursor: "pointer" }}
                      >
                        Save
                      </button>
                      <button
                        onClick={cancelEdit}
                        style={{ background: "transparent", border: "1px solid rgba(255,255,255,0.2)", color: "inherit", borderRadius: "6px", padding: "4px 10px", cursor: "pointer" }}
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <div style={{ display: "flex", gap: "8px" }}>
                      <button
                        onClick={() => startEdit(row)}
                        style={{ background: "rgba(59,130,246,0.2)", border: "1px solid rgba(59,130,246,0.5)", color: "#bfdbfe", borderRadius: "6px", padding: "4px 10px", cursor: "pointer" }}
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => onDelete(row.id)}
                        style={{ background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.45)", color: "#fca5a5", borderRadius: "6px", padding: "4px 10px", cursor: "pointer" }}
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
