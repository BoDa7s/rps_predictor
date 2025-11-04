import { cloudDataService, isSupabaseUuid, type CloudDataService } from "./cloudData";
import { signup as signupThroughEdge, setEdgeSession, type EdgeSessionTokens } from "./edgeFunctions";
import { supabaseClient } from "./supabaseClient";
import type { PlayerProfile } from "../players";
import type {
  MatchSummary,
  RoundLog,
  StatsProfile,
  StoredPredictorModelState,
} from "../stats";
import type { Session } from "@supabase/supabase-js";

export interface MigrationCredentials {
  username: string;
  password: string;
}

export type MigrationStepKey =
  | "profile"
  | "sessions"
  | "statsProfiles"
  | "aiStates"
  | "rounds"
  | "matches";

export interface MigrationProgressItem {
  key: MigrationStepKey;
  label: string;
  completed: number;
  total: number;
}

export interface MigrationSnapshot {
  playerProfile: PlayerProfile;
  statsProfiles: StatsProfile[];
  rounds: RoundLog[];
  matches: MatchSummary[];
  modelStates: StoredPredictorModelState[];
}

export interface MigrationOptions {
  snapshot: MigrationSnapshot;
  credentials: MigrationCredentials;
  onProgress?: (progress: MigrationProgressItem[]) => void;
  resume?: Partial<Record<MigrationStepKey, number>>;
}

export interface MigrationResult {
  session: Session;
  userId: string;
  progress: MigrationProgressItem[];
}

function getService(): CloudDataService {
  if (!cloudDataService) {
    throw new Error("Cloud data service is not available.");
  }
  return cloudDataService;
}

function ensureUuid(value?: string | null): string {
  if (value && isSupabaseUuid(value)) {
    return value;
  }
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  const randomHex = () => Math.floor(Math.random() * 0xffff)
    .toString(16)
    .padStart(4, "0");
  return (
    randomHex() +
    randomHex() +
    "-" +
    randomHex() +
    "-" +
    ((Math.floor(Math.random() * 0x0fff) | 0x4000).toString(16).padStart(4, "0")) +
    "-" +
    ((Math.floor(Math.random() * 0x3fff) | 0x8000).toString(16).padStart(4, "0")) +
    "-" +
    randomHex() +
    randomHex() +
    randomHex()
  );
}

function cloneProfile(profile: PlayerProfile): PlayerProfile {
  return {
    ...profile,
    consent: { ...profile.consent },
  };
}

interface NameSeed {
  firstName: string;
  lastInitial: string | null;
}

function deriveNameSeed(profile: PlayerProfile): NameSeed {
  const parts = profile.playerName.trim().split(/\s+/);
  if (parts.length === 0) {
    return { firstName: "Player", lastInitial: null };
  }
  const first = parts[0];
  const remainder = parts.slice(1).join(" ");
  const initialCandidate = remainder.replace(/\.+$/, "").trim();
  const lastInitial = initialCandidate ? initialCandidate.charAt(0).toUpperCase() : null;
  return { firstName: first, lastInitial };
}

function buildProgressSnapshot(
  totals: Record<MigrationStepKey, number>,
  completed: Partial<Record<MigrationStepKey, number>>,
): MigrationProgressItem[] {
  const descriptors: Record<MigrationStepKey, string> = {
    profile: "Profile",
    sessions: "Sessions",
    statsProfiles: "Profiles",
    aiStates: "AI states",
    rounds: "Rounds",
    matches: "Matches",
  };
  return (Object.keys(totals) as MigrationStepKey[]).map(key => ({
    key,
    label: descriptors[key],
    total: totals[key],
    completed: Math.min(completed[key] ?? 0, totals[key]),
  }));
}

function updateProgress(
  key: MigrationStepKey,
  totals: Record<MigrationStepKey, number>,
  completed: Partial<Record<MigrationStepKey, number>>,
  onProgress?: (progress: MigrationProgressItem[]) => void,
) {
  const snapshot = buildProgressSnapshot(totals, completed);
  if (onProgress) {
    onProgress(snapshot);
  }
}

function computeMigrationTotals(snapshot: MigrationSnapshot): Record<MigrationStepKey, number> {
  const playerId = snapshot.playerProfile.id;
  const statsProfiles = snapshot.statsProfiles.filter(profile => profile.user_id === playerId);
  const validProfileIds = new Set(statsProfiles.map(profile => profile.id));
  const rounds = snapshot.rounds.filter(round => round.playerId === playerId);
  const matches = snapshot.matches.filter(match => match.playerId === playerId);

  const sessionKeys = new Set<string>();
  const registerSession = (sessionId?: string | null) => {
    const key = sessionId && sessionId.trim().length > 0 ? sessionId.trim() : "__fallback";
    sessionKeys.add(key);
  };

  rounds.forEach(round => {
    registerSession(round.sessionId);
  });
  matches.forEach(match => {
    registerSession(match.sessionId);
  });

  const modelStates = snapshot.modelStates.filter(
    state => !!state.profileId && validProfileIds.has(state.profileId),
  );

  return {
    profile: 1,
    sessions: sessionKeys.size,
    statsProfiles: statsProfiles.length,
    aiStates: modelStates.length,
    rounds: rounds.length,
    matches: matches.length,
  };
}

function prepareSnapshot(snapshot: MigrationSnapshot, userId: string) {
  const playerId = snapshot.playerProfile.id;
  const statsProfiles = snapshot.statsProfiles.filter(profile => profile.user_id === playerId);
  const profileIdMap = new Map<string, string>();
  statsProfiles.forEach(profile => {
    const nextId = ensureUuid(profile.id);
    profileIdMap.set(profile.id, nextId);
  });

  const rounds = snapshot.rounds.filter(round => round.playerId === playerId);
  const matches = snapshot.matches.filter(match => match.playerId === playerId);
  const matchIdMap = new Map<string, string>();
  matches.forEach(match => {
    const nextId = ensureUuid(match.id);
    matchIdMap.set(match.id, nextId);
    if (match.clientId) {
      matchIdMap.set(match.clientId, nextId);
    }
  });

  const sessionIdMap = new Map<string, string>();
  const sessionSources = new Map<string, { started: string; ended: string }>();

  const considerSession = (sessionId: string | null | undefined, timestamp: string | null | undefined) => {
    const key = sessionId && sessionId.trim().length > 0 ? sessionId.trim() : "__fallback";
    if (!sessionIdMap.has(key)) {
      sessionIdMap.set(key, ensureUuid());
    }
    const nextId = sessionIdMap.get(key)!;
    const existing = sessionSources.get(nextId);
    const normalizedTime = timestamp && !Number.isNaN(Date.parse(timestamp)) ? new Date(timestamp).toISOString() : null;
    if (!existing) {
      sessionSources.set(nextId, {
        started: normalizedTime ?? new Date().toISOString(),
        ended: normalizedTime ?? new Date().toISOString(),
      });
      return nextId;
    }
    if (normalizedTime) {
      if (normalizedTime < existing.started) {
        existing.started = normalizedTime;
      }
      if (normalizedTime > existing.ended) {
        existing.ended = normalizedTime;
      }
    }
    return nextId;
  };

  rounds.forEach(round => {
    considerSession(round.sessionId, round.t);
  });
  matches.forEach(match => {
    considerSession(match.sessionId, match.startedAt ?? match.endedAt ?? null);
  });

  const sessions = Array.from(sessionIdMap.values()).map(id => {
    const source = sessionSources.get(id);
    return {
      id,
      userId,
      startedAt: source?.started ?? new Date().toISOString(),
      lastEventAt: source?.ended ?? source?.started ?? new Date().toISOString(),
    };
  });

  const modelStates = snapshot.modelStates
    .filter(state => state.profileId && profileIdMap.has(state.profileId))
    .map(state => ({
      ...state,
      profileId: profileIdMap.get(state.profileId)!,
    }));

  return {
    statsProfiles,
    rounds,
    matches,
    sessions,
    profileIdMap,
    matchIdMap,
    sessionIdMap,
    modelStates,
  };
}

export async function migrateLocalAccountToCloud(options: MigrationOptions): Promise<MigrationResult> {
  const service = getService();
  const { credentials, onProgress, resume } = options;
  const playerProfile = options.snapshot.playerProfile;
  const { firstName, lastInitial } = deriveNameSeed(playerProfile);
  const consentTimestamp = playerProfile.consent?.timestamp ?? new Date().toISOString();

  if (!credentials.username.trim()) {
    throw new Error("Username is required.");
  }
  if (!credentials.password) {
    throw new Error("Password is required.");
  }

  const totals: Record<MigrationStepKey, number> = computeMigrationTotals(options.snapshot);
  const completed: Partial<Record<MigrationStepKey, number>> = { ...resume };

  let session: Session | null = null;
  let userId: string | null = null;

  updateProgress("profile", totals, completed, onProgress);

  if ((completed.profile ?? 0) < totals.profile) {
    const response = await signupThroughEdge({
      firstName,
      lastInitial: lastInitial ?? "",
      grade: playerProfile.grade,
      age: playerProfile.age != null ? String(playerProfile.age) : "",
      username: credentials.username.trim(),
      password: credentials.password,
      school: playerProfile.school ?? undefined,
      priorExperience: playerProfile.priorExperience ?? undefined,
    });
    if (!response.data || response.error) {
      throw new Error(response.error ?? response.data?.message ?? "Unable to create cloud account.");
    }
    const tokens = response.data.session;
    if (!tokens) {
      throw new Error("Sign-up succeeded, but a session was not created.");
    }
    session = await setEdgeSession(tokens as EdgeSessionTokens);
    if (!session) {
      throw new Error("Unable to establish Supabase session after sign-up.");
    }
    userId = session.user?.id ?? response.data.user?.id ?? null;
    if (!userId) {
      throw new Error("Supabase session is missing a user id.");
    }
    const normalizedProfile = cloneProfile(playerProfile);
    normalizedProfile.id = userId;
    normalizedProfile.playerName = (() => {
      if (firstName && lastInitial) return `${firstName} ${lastInitial}.`;
      if (firstName) return firstName;
      return credentials.username.trim();
    })();
    normalizedProfile.consent = {
      agreed: true,
      consentTextVersion: normalizedProfile.consent?.consentTextVersion ?? "v1",
      timestamp: consentTimestamp,
    };
    normalizedProfile.needsReview = playerProfile.grade === "Not applicable" || playerProfile.age == null;
    await service.upsertPlayerProfile({
      ...normalizedProfile,
      grade: playerProfile.grade,
      age: playerProfile.age,
      school: playerProfile.school,
      priorExperience: playerProfile.priorExperience,
    });
    completed.profile = 1;
    updateProgress("profile", totals, completed, onProgress);
  } else {
    const client = supabaseClient;
    if (!client) {
      throw new Error("Supabase client is not available to resume migration.");
    }
    const { data } = await client.auth.getSession();
    session = data.session ?? null;
    userId = session?.user?.id ?? null;
    if (!session || !userId) {
      throw new Error("Resume requested but Supabase session is not available.");
    }
  }

  if (!session || !userId) {
    throw new Error("Supabase session could not be established.");
  }

  const prepared = prepareSnapshot(options.snapshot, userId);
  totals.sessions = prepared.sessions.length;
  totals.statsProfiles = prepared.statsProfiles.length;
  totals.aiStates = prepared.modelStates.length;
  totals.rounds = prepared.rounds.length;
  totals.matches = prepared.matches.length;
  updateProgress("profile", totals, completed, onProgress);

  if ((completed.sessions ?? 0) < totals.sessions) {
    let index = completed.sessions ?? 0;
    for (; index < prepared.sessions.length; index += 1) {
      const sessionInput = prepared.sessions[index];
      await service.upsertSession({
        id: sessionInput.id,
        userId: sessionInput.userId,
        startedAt: sessionInput.startedAt,
        lastEventAt: sessionInput.lastEventAt,
        storageMode: "cloud",
      });
      completed.sessions = index + 1;
      updateProgress("sessions", totals, completed, onProgress);
    }
  }

  if ((completed.statsProfiles ?? 0) < totals.statsProfiles) {
    let index = completed.statsProfiles ?? 0;
    for (; index < prepared.statsProfiles.length; index += 1) {
      const profile = prepared.statsProfiles[index];
      const normalized = {
        ...profile,
        id: prepared.profileIdMap.get(profile.id) ?? profile.id,
        user_id: userId,
        demographics_profile_id: userId,
        previous_profile_id:
          profile.previous_profile_id && prepared.profileIdMap.has(profile.previous_profile_id)
            ? prepared.profileIdMap.get(profile.previous_profile_id)!
            : null,
        next_profile_id:
          profile.next_profile_id && prepared.profileIdMap.has(profile.next_profile_id)
            ? prepared.profileIdMap.get(profile.next_profile_id)!
            : null,
        metadata: profile.metadata ?? {},
        version: profile.version && Number.isFinite(profile.version) ? Math.max(1, Math.floor(profile.version)) : 1,
        training_count: Number.isFinite(profile.training_count) ? Number(profile.training_count) : 0,
        training_completed: profile.training_completed === true,
        predictor_default: profile.predictor_default === true,
        seen_post_training_cta: profile.seen_post_training_cta === true,
        archived: profile.archived === true,
      } as StatsProfile;
      normalized.base_name = profile.base_name ?? profile.display_name ?? "Primary";
      normalized.display_name = profile.display_name ?? normalized.base_name;
      normalized.profile_version = Math.max(
        1,
        Number.isFinite(profile.profile_version) ? Math.floor(Number(profile.profile_version)) : 1,
      );
      normalized.updated_at = profile.updated_at ?? new Date().toISOString();
      normalized.created_at = profile.created_at ?? normalized.updated_at;
      await service.upsertStatsProfile(normalized);
      completed.statsProfiles = index + 1;
      updateProgress("statsProfiles", totals, completed, onProgress);
    }
  }

  if ((completed.aiStates ?? 0) < totals.aiStates) {
    let index = completed.aiStates ?? 0;
    for (; index < prepared.modelStates.length; index += 1) {
      const state = prepared.modelStates[index];
      await service.upsertAiState({
        userId,
        profileId: state.profileId,
        modelVersion: state.modelVersion,
        roundsSeen: state.roundsSeen,
        state: state.state,
        updatedAt: state.updatedAt,
        needsRebuild: false,
      });
      completed.aiStates = index + 1;
      updateProgress("aiStates", totals, completed, onProgress);
    }
  }

  if ((completed.rounds ?? 0) < totals.rounds) {
    const sortedRounds = [...prepared.rounds].sort((a, b) => {
      const timeA = a.t ? Date.parse(a.t) : 0;
      const timeB = b.t ? Date.parse(b.t) : 0;
      return timeA - timeB;
    });
    const batches: RoundLog[][] = [];
    const batchSize = 50;
    for (let i = 0; i < sortedRounds.length; i += batchSize) {
      batches.push(sortedRounds.slice(i, i + batchSize));
    }
    let processed = completed.rounds ?? 0;
    const sessionCounters = new Map<string, number>();
    for (const round of sortedRounds.slice(0, processed)) {
      const originalSessionId = round.sessionId && round.sessionId.trim().length > 0 ? round.sessionId.trim() : "__fallback";
      const mappedSessionId = prepared.sessionIdMap.get(originalSessionId) ?? prepared.sessionIdMap.get("__fallback");
      if (mappedSessionId) {
        const current = sessionCounters.get(mappedSessionId) ?? 0;
        sessionCounters.set(mappedSessionId, current + 1);
      }
    }
    for (const batch of batches) {
      const payload = batch.map(round => {
        const originalSessionId = round.sessionId && round.sessionId.trim().length > 0 ? round.sessionId.trim() : "__fallback";
        const mappedSessionId = prepared.sessionIdMap.get(originalSessionId) ?? ensureUuid();
        const mappedProfileId = prepared.profileIdMap.get(round.profileId) ?? round.profileId;
        const mappedMatchId = round.matchId ? prepared.matchIdMap.get(round.matchId) ?? null : null;
        const mappedRoundId = ensureUuid(round.id);
        const counter = (sessionCounters.get(mappedSessionId) ?? 0) + 1;
        sessionCounters.set(mappedSessionId, counter);
        return {
          round: {
            ...round,
            id: mappedRoundId,
            sessionId: mappedSessionId,
            profileId: mappedProfileId,
            playerId: userId!,
            matchId: mappedMatchId ?? undefined,
          },
          roundNumber: counter,
        };
      });
      await service.insertRounds(payload);
      processed += batch.length;
      completed.rounds = processed;
      updateProgress("rounds", totals, completed, onProgress);
    }
  }

  if ((completed.matches ?? 0) < totals.matches) {
    let index = completed.matches ?? 0;
    for (; index < prepared.matches.length; index += 1) {
      const match = prepared.matches[index];
      const mappedId = prepared.matchIdMap.get(match.id) ?? ensureUuid(match.id);
      const mappedProfileId = prepared.profileIdMap.get(match.profileId) ?? match.profileId;
      const originalSessionId = match.sessionId && match.sessionId.trim().length > 0 ? match.sessionId.trim() : "__fallback";
      const mappedSessionId = prepared.sessionIdMap.get(originalSessionId) ?? ensureUuid();
      await service.insertMatches([
        {
          ...match,
          id: mappedId,
          sessionId: mappedSessionId,
          playerId: userId!,
          profileId: mappedProfileId,
        },
      ]);
      completed.matches = index + 1;
      updateProgress("matches", totals, completed, onProgress);
    }
  }

  const finalProgress = buildProgressSnapshot(totals, completed);
  return { session, userId, progress: finalProgress };
}
