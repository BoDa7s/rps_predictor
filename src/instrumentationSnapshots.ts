import { useEffect, useMemo, useState } from "react";

import type { DevInstrumentationSnapshot, InstrumentationScope } from "./devInstrumentation";

export type SnapshotTrigger = "manual" | "match-ended" | "round-interval" | "time-interval";

export interface InstrumentationSnapshotRecord {
  id: string;
  name: string;
  createdAt: string;
  version: number;
  trigger: SnapshotTrigger;
  scope: InstrumentationScope;
  playerId: string | null;
  profileId: string | null;
  data: DevInstrumentationSnapshot;
  notes: string;
  pinned: boolean;
}

interface StorageScopeEntry {
  version: number;
  snapshots: InstrumentationSnapshotRecord[];
  autoCaptureEnabled?: boolean;
}

interface SnapshotStorage {
  scopes: Record<string, StorageScopeEntry>;
}

const STORAGE_KEY = "rps_dev_instrumentation_snapshots_v1";
const MAX_SNAPSHOTS_PER_SCOPE = 200;

type Listener = () => void;

function scopeKey(scope: InstrumentationScope): string {
  return `${scope.playerId ?? "__anon"}::${scope.profileId ?? "__all"}`;
}

function ensureScopeEntry(storage: SnapshotStorage, scope: InstrumentationScope): StorageScopeEntry {
  const key = scopeKey(scope);
  const existing = storage.scopes[key];
  if (existing) {
    return existing;
  }
  const entry: StorageScopeEntry = {
    version: 0,
    snapshots: [],
    autoCaptureEnabled: false,
  };
  storage.scopes[key] = entry;
  return entry;
}

function readStorage(): SnapshotStorage {
  if (typeof window === "undefined") {
    return { scopes: {} };
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { scopes: {} };
    const parsed = JSON.parse(raw) as SnapshotStorage;
    if (!parsed || typeof parsed !== "object" || !("scopes" in parsed)) {
      return { scopes: {} };
    }
    return {
      scopes: parsed.scopes ?? {},
    };
  } catch {
    return { scopes: {} };
  }
}

function writeStorage(next: SnapshotStorage) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* noop */
  }
}

function createName(scope: InstrumentationScope, createdAtIso: string): string {
  const playerLabel = scope.playerName || "Unknown player";
  const profileLabel = scope.profileName || (scope.profileId ? "Profile" : "All profiles");
  const createdAt = new Date(createdAtIso);
  const formatted = Number.isNaN(createdAt.getTime())
    ? createdAtIso
    : `${createdAt.getFullYear()}-${String(createdAt.getMonth() + 1).padStart(2, "0")}-${String(
        createdAt.getDate(),
      ).padStart(2, "0")} ${String(createdAt.getHours()).padStart(2, "0")}:${String(createdAt.getMinutes()).padStart(2, "0")}`;
  return `${playerLabel} • ${profileLabel} • ${formatted}`;
}

function sortSnapshots(list: InstrumentationSnapshotRecord[]): InstrumentationSnapshotRecord[] {
  return [...list].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

class InstrumentationSnapshotStore {
  private listeners = new Set<Listener>();

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit() {
    this.listeners.forEach(listener => listener());
  }

  saveSnapshot(
    scope: InstrumentationScope,
    snapshot: DevInstrumentationSnapshot,
    trigger: SnapshotTrigger,
  ): InstrumentationSnapshotRecord | null {
    if (!scope.playerId && !scope.profileId) {
      // Require at least player context to persist meaningful data.
      return null;
    }
    const current = readStorage();
    const key = scopeKey(scope);
    const entry = ensureScopeEntry(current, scope);
    const createdAt = new Date().toISOString();
    const version = entry.version + 1;
    const record: InstrumentationSnapshotRecord = {
      id: `${key}:${createdAt}:${version}`,
      name: createName(scope, createdAt),
      createdAt,
      version,
      trigger,
      scope: {
        playerId: scope.playerId,
        profileId: scope.profileId,
        playerName: scope.playerName ?? null,
        profileName: scope.profileName ?? null,
      },
      playerId: scope.playerId,
      profileId: scope.profileId,
      data: snapshot,
      notes: "",
      pinned: false,
    };
    const snapshots = [record, ...entry.snapshots];
    if (snapshots.length > MAX_SNAPSHOTS_PER_SCOPE) {
      snapshots.length = MAX_SNAPSHOTS_PER_SCOPE;
    }
    current.scopes[key] = { ...entry, version, snapshots };
    writeStorage(current);
    this.emit();
    return record;
  }

  list(scope: InstrumentationScope | null): InstrumentationSnapshotRecord[] {
    if (!scope) return [];
    const key = scopeKey(scope);
    const current = readStorage();
    const entry = current.scopes[key];
    if (!entry) return [];
    return sortSnapshots(entry.snapshots);
  }

  listAllScopes(): InstrumentationScope[] {
    const current = readStorage();
    const entries: InstrumentationScope[] = [];
    for (const [key, value] of Object.entries(current.scopes)) {
      if (!value?.snapshots?.length) continue;
      const latest = value.snapshots[0];
      entries.push(latest.scope);
    }
    return entries;
  }

  updateNotes(scope: InstrumentationScope, id: string, notes: string) {
    const current = readStorage();
    const key = scopeKey(scope);
    const entry = current.scopes[key];
    if (!entry) return;
    const index = entry.snapshots.findIndex(item => item.id === id);
    if (index === -1) return;
    entry.snapshots[index] = { ...entry.snapshots[index], notes };
    writeStorage(current);
    this.emit();
  }

  togglePin(scope: InstrumentationScope, id: string) {
    const current = readStorage();
    const key = scopeKey(scope);
    const entry = current.scopes[key];
    if (!entry) return;
    const index = entry.snapshots.findIndex(item => item.id === id);
    if (index === -1) return;
    const target = entry.snapshots[index];
    entry.snapshots[index] = { ...target, pinned: !target.pinned };
    writeStorage(current);
    this.emit();
  }

  delete(scope: InstrumentationScope, id: string) {
    const current = readStorage();
    const key = scopeKey(scope);
    const entry = current.scopes[key];
    if (!entry) return;
    const nextSnapshots = entry.snapshots.filter(item => item.id !== id);
    current.scopes[key] = { ...entry, snapshots: nextSnapshots };
    writeStorage(current);
    this.emit();
  }

  isAutoCaptureEnabled(scope: InstrumentationScope): boolean {
    const current = readStorage();
    const key = scopeKey(scope);
    const entry = current.scopes[key];
    return Boolean(entry?.autoCaptureEnabled);
  }

  setAutoCaptureEnabled(scope: InstrumentationScope, enabled: boolean) {
    const current = readStorage();
    const entry = ensureScopeEntry(current, scope);
    if (entry.autoCaptureEnabled === enabled) return;
    entry.autoCaptureEnabled = enabled;
    current.scopes[scopeKey(scope)] = { ...entry };
    writeStorage(current);
    this.emit();
  }
}

export const instrumentationSnapshots = new InstrumentationSnapshotStore();

export function useInstrumentationSnapshots(scope: InstrumentationScope | null): InstrumentationSnapshotRecord[] {
  const [list, setList] = useState<InstrumentationSnapshotRecord[]>(() => instrumentationSnapshots.list(scope));

  useEffect(() => {
    setList(instrumentationSnapshots.list(scope));
    return instrumentationSnapshots.subscribe(() => {
      setList(instrumentationSnapshots.list(scope));
    });
  }, [scope?.playerId, scope?.profileId, scope?.playerName, scope?.profileName]);

  return list;
}

export function useInstrumentationScopes(): InstrumentationScope[] {
  const [scopes, setScopes] = useState<InstrumentationScope[]>(() => instrumentationSnapshots.listAllScopes());

  useEffect(() => {
    const update = () => setScopes(instrumentationSnapshots.listAllScopes());
    update();
    return instrumentationSnapshots.subscribe(update);
  }, []);

  return useMemo(() => scopes, [scopes]);
}

export function useAutoCapture(scope: InstrumentationScope | null): boolean {
  const [enabled, setEnabled] = useState<boolean>(() => (scope ? instrumentationSnapshots.isAutoCaptureEnabled(scope) : false));

  useEffect(() => {
    if (!scope) {
      setEnabled(false);
      return () => {};
    }
    setEnabled(instrumentationSnapshots.isAutoCaptureEnabled(scope));
    return instrumentationSnapshots.subscribe(() => {
      setEnabled(instrumentationSnapshots.isAutoCaptureEnabled(scope));
    });
  }, [scope?.playerId, scope?.profileId, scope?.playerName, scope?.profileName]);

  return enabled;
}

export function exportSnapshotToJson(record: InstrumentationSnapshotRecord): string {
  return JSON.stringify(
    {
      id: record.id,
      name: record.name,
      createdAt: record.createdAt,
      version: record.version,
      scope: record.scope,
      trigger: record.trigger,
      metrics: record.data,
      notes: record.notes,
    },
    null,
    2,
  );
}

export function exportSnapshotRoundsToCsv(record: InstrumentationSnapshotRecord): string {
  const header = [
    "matchId",
    "roundNumber",
    "mode",
    "difficulty",
    "bestOf",
    "readyAt",
    "completedAt",
    "responseTimeMs",
    "responseSpeedMs",
    "interRoundDelayMs",
    "outcome",
    "aiStreak",
    "youStreak",
    "clicks",
    "interactions",
  ];
  const lines = [header.join(",")];
  const rounds = record.data.recentRounds ?? [];
  rounds.forEach(round => {
    lines.push(
      [
        round.matchId,
        round.roundNumber,
        round.mode,
        round.difficulty,
        round.bestOf,
        round.readyAt ?? "",
        round.completedAt ?? "",
        round.responseTimeMs ?? "",
        round.responseSpeedMs ?? "",
        round.interRoundDelayMs ?? "",
        round.outcome ?? "",
        round.aiStreak ?? "",
        round.youStreak ?? "",
        round.clicks,
        round.interactions,
      ]
        .map(value => `${value}`)
        .join(","),
    );
  });
  return lines.join("\n");
}

export function downloadSnapshot(record: InstrumentationSnapshotRecord, format: "json" | "csv") {
  if (typeof window === "undefined") return;
  const blob = new Blob([
    format === "json" ? exportSnapshotToJson(record) : exportSnapshotRoundsToCsv(record),
  ], {
    type: format === "json" ? "application/json" : "text/csv",
  });
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  const extension = format === "json" ? "json" : "csv";
  anchor.download = `${record.name.replace(/[^a-z0-9-_\.]+/gi, "_")}.${extension}`;
  anchor.click();
  window.URL.revokeObjectURL(url);
}

export function downloadSnapshotRange(records: InstrumentationSnapshotRecord[], format: "json" | "csv", filename?: string) {
  if (!records.length || typeof window === "undefined") return;
  const safeName = filename ?? `snapshot_range_${records[0].playerId ?? "all"}`;
  const sanitized = safeName.replace(/[^a-z0-9-_\.]+/gi, "_");
  let content = "";
  let mime = "application/json";
  let extension = "json";
  if (format === "json") {
    content = JSON.stringify(
      records.map(record => ({
        id: record.id,
        name: record.name,
        createdAt: record.createdAt,
        version: record.version,
        trigger: record.trigger,
        scope: record.scope,
        notes: record.notes,
        metrics: record.data,
      })),
      null,
      2,
    );
  } else {
    mime = "text/csv";
    extension = "csv";
    content = records
      .map(record => `# ${record.name}\n${exportSnapshotRoundsToCsv(record)}`)
      .join("\n\n");
  }
  const blob = new Blob([content], { type: mime });
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${sanitized}.${extension}`;
  anchor.click();
  window.URL.revokeObjectURL(url);
}

export function makeScope(playerId: string | null, profileId: string | null, playerName?: string | null, profileName?: string | null): InstrumentationScope {
  return {
    playerId,
    profileId,
    playerName: playerName ?? null,
    profileName: profileName ?? null,
  };
}
