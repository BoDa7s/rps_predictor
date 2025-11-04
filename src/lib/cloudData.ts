import { supabaseClient, type SupabaseClient } from "./supabaseClient";
import type {
  AiStateInsert,
  AiStateRow,
  Database,
  DemographicsProfileInsert,
  DemographicsProfileRow,
  MatchInsert,
  MatchRow,
  RoundInsert,
  RoundRow,
  SessionInsert,
  SessionRow,
  StatsProfileInsert,
  StatsProfileRow,
  UserSettingInsert,
  UserSettingRow,
} from "./database.types";
import type { PlayerProfile, Grade } from "../players";
import { CONSENT_TEXT_VERSION, GRADE_OPTIONS, sanitizeAge } from "../players";
import type {
  MatchSummary,
  RoundLog,
  StatsProfile,
  StoredPredictorModelState,
} from "../stats";
import type { AIMode, Mode } from "../gameTypes";
import type { LeaderboardMatchEntry } from "../leaderboardData";

type Maybe<T> = T | null | undefined;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function asUuid(value: Maybe<string>): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (trimmed.length === 0) return undefined;
  return UUID_PATTERN.test(trimmed) ? trimmed : undefined;
}

type DeveloperRoomPlayerOverviewRow =
  Database["public"]["Views"]["developer_room_player_overview"]["Row"];

export function isSupabaseUuid(value: Maybe<string>): value is string {
  return Boolean(asUuid(value));
}

function isGrade(value: Maybe<string>): value is Grade {
  if (!value) return false;
  return GRADE_OPTIONS.includes(value as Grade);
}

function coerceTimestamp(value: Maybe<string>): string {
  if (typeof value === "string" && value.trim().length > 0) {
    return value;
  }
  return new Date().toISOString();
}

function normalizeTimestamp(value: Maybe<string>): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.length > 0) {
      return trimmed;
    }
  }
  return null;
}

function asMode(value: Maybe<string>): Mode | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === "challenge" || normalized === "practice" || normalized === "training") {
    return normalized as Mode;
  }
  return null;
}

function asAIMode(value: Maybe<string>): AIMode | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === "fair" || normalized === "normal" || normalized === "ruthless") {
    return normalized as AIMode;
  }
  return null;
}

function parseNumber(value: Maybe<number | string>): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
}

function parseNonNegativeInteger(value: Maybe<number | string>, fallback = 0): number {
  const parsed = parseNumber(value);
  if (parsed == null) return fallback;
  const normalized = Math.floor(parsed);
  return Number.isFinite(normalized) && normalized >= 0 ? normalized : fallback;
}

function splitPlayerName(name: Maybe<string>): { firstName: string | null; lastInitial: string | null } {
  if (typeof name !== "string") {
    return { firstName: null, lastInitial: null };
  }
  const trimmed = name.trim();
  if (!trimmed) {
    return { firstName: null, lastInitial: null };
  }
  const [first, ...rest] = trimmed.split(/\s+/);
  const normalizedFirst = first?.trim() ?? "";
  const tail = rest.join(" ").trim();
  const lastInitial = tail ? tail.charAt(0).toUpperCase() : null;
  return {
    firstName: normalizedFirst || null,
    lastInitial,
  };
}

export type DemographicsProfileUpsert = DemographicsProfileInsert;

export type StatsProfileUpsert = StatsProfileInsert;

function formatStatsProfileLineage(index: number): string {
  const normalizedIndex = Number.isFinite(index) ? Math.max(1, Math.floor(index)) : 1;
  return normalizedIndex <= 1 ? "Primary" : `Primary ${normalizedIndex}`;
}

function normalizeStatsProfileBaseName(value: Maybe<string>): string {
  const input = (value ?? "").replace(/\s+v\d+$/i, "").trim();
  if (!input) return "Primary";
  const primaryMatch = input.match(/^primary(?:\s+(\d+))?$/i);
  if (primaryMatch) {
    const parsed = primaryMatch[1] ? Number.parseInt(primaryMatch[1], 10) : 1;
    const lineageIndex = Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
    return formatStatsProfileLineage(lineageIndex);
  }
  return input;
}

function makeStatsProfileDisplayName(baseName: string, version: number): string {
  const normalizedBase = normalizeStatsProfileBaseName(baseName);
  if (!Number.isFinite(version) || version <= 1) {
    return normalizedBase;
  }
  const normalizedVersion = Math.max(1, Math.floor(version));
  return `${normalizedBase} v${normalizedVersion}`;
}

function coercePositiveInteger(value: Maybe<number>, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    const normalized = Math.floor(value);
    if (normalized > 0) {
      return normalized;
    }
  }
  return fallback;
}

function coerceNonNegativeInteger(value: Maybe<number>, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    const normalized = Math.floor(value);
    if (normalized >= 0) {
      return normalized;
    }
  }
  return fallback;
}

export interface RoundInsertInput {
  round: RoundLog;
  roundNumber: number;
}

export type AiStateUpsertInput = StoredPredictorModelState & {
  userId: string;
  needsRebuild?: boolean;
  lastRoundId?: string | null;
  id?: string;
  version?: number;
};

export interface CloudSession {
  id: string;
  userId: string;
  demographicsProfileId?: string | null;
  primaryStatsProfileId?: string | null;
  deviceId?: string | null;
  clientSessionId?: string | null;
  storageMode?: string | null;
  startedAt: string;
  endedAt?: string | null;
  lastEventAt?: string | null;
  sessionLabel?: string | null;
  clientVersion?: string | null;
  locale?: string | null;
  metadata?: Record<string, unknown>;
  version?: number | null;
}

export type SessionUpsertInput = Partial<CloudSession> & {
  userId: string;
  startedAt: string;
  id?: string;
};

export interface UserSetting {
  id: string;
  userId: string;
  statsProfileId?: string | null;
  sessionId?: string | null;
  scope: string;
  key: string;
  value: unknown;
  version: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface UserSettingUpsertInput {
  id?: string;
  userId: string;
  statsProfileId?: string | null;
  sessionId?: string | null;
  scope?: string;
  key: string;
  value: unknown;
  version?: number;
}

export interface DeveloperRoomPlayerOverview {
  player: PlayerProfile;
  hasDemographics: boolean;
  trainingCompleted: boolean;
  trainingCount: number;
  consentVersion: string | null;
  consentGrantedAt: string | null;
  lastPromotedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  storageMode: DeveloperRoomPlayerOverviewRow["storage_mode"];
  profileCount: number;
  matchCount: number;
  roundCount: number;
  lastProfileUpdatedAt: string | null;
  lastMatchAt: string | null;
  lastRoundAt: string | null;
  lastPlayedAt: string | null;
  lastActivityAt: string | null;
  needsReview: boolean;
}

function demographicsRowToPlayerProfile(row: DemographicsProfileRow): PlayerProfile {
  const userId = row.user_id;
  const firstName = row.first_name?.trim();
  const lastInitial = row.last_initial?.trim();
  const username = row.username?.trim();

  const name = (() => {
    if (firstName && lastInitial) return `${firstName} ${lastInitial}.`;
    if (firstName) return firstName;
    if (username) return username;
    return "Player";
  })();

  const gradeCandidate = row.grade?.trim() ?? null;
  const grade = isGrade(gradeCandidate) ? gradeCandidate : "Not applicable";

  const age = sanitizeAge(row.age ?? null);

  const consentVersion = row.consent_version?.trim() || CONSENT_TEXT_VERSION;
  const consentTimestamp = coerceTimestamp(row.consent_granted_at);

  return {
    id: userId,
    playerName: name,
    grade,
    age,
    school: row.school ?? undefined,
    priorExperience: row.prior_experience ?? undefined,
    consent: {
      agreed: true,
      consentTextVersion: consentVersion,
      timestamp: consentTimestamp,
    },
    needsReview: !isGrade(gradeCandidate) || age === null,
  };
}

function playerProfileToDemographicsUpsert(profile: PlayerProfile): DemographicsProfileUpsert {
  const { firstName, lastInitial } = splitPlayerName(profile.playerName);
  const trainingCompleted = profile.needsReview ? false : true;
  const trainingCount = trainingCompleted ? 1 : 0;
  return {
    user_id: profile.id,
    username: profile.playerName,
    first_name: firstName,
    last_initial: lastInitial,
    grade: profile.grade,
    school: profile.school ?? null,
    age: profile.age != null ? String(profile.age) : null,
    prior_experience: profile.priorExperience ?? null,
    consent_version: profile.consent?.consentTextVersion ?? CONSENT_TEXT_VERSION,
    consent_granted_at: profile.consent?.timestamp ?? new Date().toISOString(),
    training_completed: trainingCompleted,
    training_count: trainingCount,
  };
}

function developerOverviewRowToDemographicsRow(
  row: DeveloperRoomPlayerOverviewRow,
): DemographicsProfileRow {
  const ageText = row.age_text ?? (row.age_numeric != null ? String(row.age_numeric) : null);
  const updatedAt =
    normalizeTimestamp(row.updated_at) ??
    normalizeTimestamp(row.last_activity_at) ??
    coerceTimestamp(null);
  return {
    user_id: row.player_id,
    username: row.username,
    first_name: row.first_name,
    last_initial: row.last_initial,
    grade: row.grade,
    school: row.school,
    created_at:
      normalizeTimestamp(row.created_at) ??
      normalizeTimestamp(row.last_activity_at) ??
      normalizeTimestamp(row.last_profile_updated_at) ??
      normalizeTimestamp(row.last_match_at) ??
      normalizeTimestamp(row.last_round_at) ??
      normalizeTimestamp(row.last_played_at) ??
      null,
    age: ageText,
    prior_experience: row.prior_experience,
    training_completed: row.training_completed === true,
    training_count: coerceNonNegativeInteger(row.training_count ?? undefined, 0),
    storage_mode: (row.storage_mode ?? "local") as DemographicsProfileRow["storage_mode"],
    updated_at: updatedAt,
    preferences: {} as DemographicsProfileRow["preferences"],
    consent_version: row.consent_version,
    consent_granted_at: normalizeTimestamp(row.consent_granted_at),
    last_promoted_at: normalizeTimestamp(row.last_promoted_at),
  };
}

function developerOverviewRowToOverview(
  row: DeveloperRoomPlayerOverviewRow,
): DeveloperRoomPlayerOverview {
  const demographicsRow = developerOverviewRowToDemographicsRow(row);
  const player = demographicsRowToPlayerProfile(demographicsRow);
  const lastProfileUpdatedAt = normalizeTimestamp(row.last_profile_updated_at);
  const lastMatchAt = normalizeTimestamp(row.last_match_at);
  const lastRoundAt = normalizeTimestamp(row.last_round_at);
  const lastPlayedAt = normalizeTimestamp(row.last_played_at) ?? lastRoundAt ?? lastMatchAt;
  const lastActivityAt =
    normalizeTimestamp(row.last_activity_at) ?? lastProfileUpdatedAt ?? lastMatchAt ?? lastRoundAt ?? lastPlayedAt;
  return {
    player,
    hasDemographics: row.has_demographics === true,
    trainingCompleted: row.training_completed === true,
    trainingCount: coerceNonNegativeInteger(row.training_count ?? undefined, 0),
    consentVersion: row.consent_version ?? null,
    consentGrantedAt: normalizeTimestamp(row.consent_granted_at),
    lastPromotedAt: normalizeTimestamp(row.last_promoted_at),
    createdAt: normalizeTimestamp(row.created_at),
    updatedAt: normalizeTimestamp(row.updated_at) ?? lastActivityAt,
    storageMode: row.storage_mode ?? null,
    profileCount: parseNonNegativeInteger(row.profile_count, 0),
    matchCount: parseNonNegativeInteger(row.match_count, 0),
    roundCount: parseNonNegativeInteger(row.round_count, 0),
    lastProfileUpdatedAt,
    lastMatchAt,
    lastRoundAt,
    lastPlayedAt,
    lastActivityAt,
    needsReview: row.needs_review === true || player.needsReview,
  };
}

function statsProfileRowToStatsProfile(row: StatsProfileRow): StatsProfile | null {
  if (!row || typeof row !== "object") return null;
  if (!row.id || !row.user_id) return null;
  if (row.archived) return null;

  const base_name = (row.base_name?.trim() || "primary") as StatsProfile["base_name"];
  const display_name = (row.display_name?.trim() || base_name || "Primary") as StatsProfile["display_name"];
  const profile_version = Math.max(
    1,
    Math.floor(Number.isFinite(row.profile_version) ? Number(row.profile_version) : 1),
  ) as StatsProfile["profile_version"];
  const created_at = coerceTimestamp(row.created_at) as StatsProfile["created_at"];
  const updated_at = coerceTimestamp(row.updated_at) as StatsProfile["updated_at"];
  const training_count = typeof row.training_count === "number" ? row.training_count : 0;
  const training_completed = row.training_completed === true;
  const predictor_default = row.predictor_default === true;
  const seen_post_training_cta = row.seen_post_training_cta === true;
  const previous_profile_id = row.previous_profile_id ?? null;
  const next_profile_id = row.next_profile_id ?? null;
  const archived = Boolean(row.archived);
  const metadata: StatsProfile["metadata"] =
    row.metadata !== null && row.metadata !== undefined
      ? (row.metadata as StatsProfile["metadata"])
      : ({} as StatsProfile["metadata"]);
  const version = Math.max(1, Math.floor(Number.isFinite(row.version) ? Number(row.version) : 1));

  return {
    id: row.id,
    user_id: row.user_id,
    demographics_profile_id: row.demographics_profile_id ?? null,
    base_name,
    profile_version,
    display_name,
    training_count,
    training_completed,
    predictor_default,
    seen_post_training_cta,
    previous_profile_id,
    next_profile_id,
    archived,
    metadata,
    created_at,
    updated_at,
    version,
  };
}

function statsProfileToUpsert(profile: StatsProfile): StatsProfileUpsert {
  const userIdRaw = typeof profile.user_id === "string" ? profile.user_id : "";
  const user_id = userIdRaw.trim();
  if (!isSupabaseUuid(user_id)) {
    throw new Error("Stats profile payload requires a valid user_id");
  }

  const statsProfileId = asUuid(profile.id ?? undefined);
  const demographicsProfileId = asUuid(profile.demographics_profile_id ?? undefined);
  const previousProfileId = asUuid(profile.previous_profile_id ?? undefined);
  const nextProfileId = asUuid(profile.next_profile_id ?? undefined);

  const baseNameInput =
    typeof profile.base_name === "string" && profile.base_name.trim().length > 0
      ? profile.base_name
      : profile.display_name;
  const base_name = normalizeStatsProfileBaseName(baseNameInput);

  const profile_version = coercePositiveInteger(profile.profile_version, 1);
  const display_name = (() => {
    if (typeof profile.display_name === "string" && profile.display_name.trim().length > 0) {
      return profile.display_name.trim();
    }
    return makeStatsProfileDisplayName(base_name, profile_version);
  })();

  const training_count = coerceNonNegativeInteger(profile.training_count, 0);
  const metadata: StatsProfileUpsert["metadata"] =
    profile.metadata && typeof profile.metadata === "object"
      ? (profile.metadata as StatsProfileUpsert["metadata"])
      : ({} as StatsProfileUpsert["metadata"]);
  const version = coercePositiveInteger(profile.version, 1);

  const payload: StatsProfileUpsert = {
    user_id,
    base_name,
    profile_version,
    display_name,
    training_count,
    training_completed: profile.training_completed === true,
    predictor_default: profile.predictor_default === true,
    seen_post_training_cta: profile.seen_post_training_cta === true,
    archived: profile.archived === true,
    metadata,
    version,
  };

  if (statsProfileId) {
    payload.id = statsProfileId;
    if (previousProfileId) {
      payload.previous_profile_id = previousProfileId;
    }
    if (nextProfileId) {
      payload.next_profile_id = nextProfileId;
    }
  }

  if (demographicsProfileId === user_id) {
    payload.demographics_profile_id = demographicsProfileId;
  }

  return payload;
}

function roundLogToRow({ round, roundNumber }: RoundInsertInput): RoundInsert {
  const predicted =
    round.policy === "mixer"
      ? round.mixer?.counter ?? null
      : round.heuristic?.predicted ?? null;
  const row: RoundInsert = {
    user_id: round.playerId,
    session_id: round.sessionId,
    stats_profile_id: round.profileId,
    match_id: asUuid(round.matchId) ?? null,
    client_round_id: round.id,
    round_number: roundNumber,
    played_at: round.t,
    mode: round.mode as RoundInsert["mode"],
    difficulty: round.difficulty as RoundInsert["difficulty"],
    best_of: round.bestOf,
    player_move: round.player as RoundInsert["player_move"],
    ai_move: round.ai as RoundInsert["ai_move"],
    predicted_player_move: predicted as RoundInsert["predicted_player_move"],
    outcome: round.outcome as RoundInsert["outcome"],
    decision_policy: round.policy as RoundInsert["decision_policy"],
    reason: round.reason ?? null,
    ai_confidence: round.confidence ?? null,
    confidence_bucket: (round.confidenceBucket ?? null) as RoundInsert["confidence_bucket"],
    decision_time_ms: round.decisionTimeMs ?? null,
    streak_ai: Number.isFinite(round.streakAI) ? round.streakAI : null,
    streak_you: Number.isFinite(round.streakYou) ? round.streakYou : null,
    mixer_trace: (round.mixer ?? null) as RoundInsert["mixer_trace"],
    heuristic_trace: (round.heuristic ?? null) as RoundInsert["heuristic_trace"],
  };
  const rowId = asUuid(round.id);
  if (rowId) {
    row.id = rowId;
  }
  return row;
}

function rowToRoundLog(row: RoundRow): RoundLog | null {
  if (!row || !row.client_round_id || !row.session_id || !row.stats_profile_id || !row.user_id) {
    return null;
  }
  const confidenceBucket =
    row.confidence_bucket === "low" || row.confidence_bucket === "medium" || row.confidence_bucket === "high"
      ? row.confidence_bucket
      : "low";
  return {
    id: row.client_round_id,
    sessionId: row.session_id,
    matchId: row.match_id ?? undefined,
    playerId: row.user_id,
    profileId: row.stats_profile_id,
    t: row.played_at,
    mode: row.mode as RoundLog["mode"],
    bestOf: row.best_of as RoundLog["bestOf"],
    difficulty: row.difficulty as RoundLog["difficulty"],
    player: row.player_move as RoundLog["player"],
    ai: row.ai_move as RoundLog["ai"],
    outcome: row.outcome as RoundLog["outcome"],
    policy: row.decision_policy as RoundLog["policy"],
    mixer: (row.mixer_trace ?? undefined) as RoundLog["mixer"],
    heuristic: (row.heuristic_trace ?? undefined) as RoundLog["heuristic"],
    streakAI: typeof row.streak_ai === "number" ? row.streak_ai : 0,
    streakYou: typeof row.streak_you === "number" ? row.streak_you : 0,
    reason: row.reason ?? "",
    confidence: typeof row.ai_confidence === "number" ? row.ai_confidence : 0,
    confidenceBucket,
    decisionTimeMs: row.decision_time_ms ?? undefined,
  };
}

function matchSummaryToRow(match: MatchSummary): MatchInsert {
  const row: MatchInsert = {
    user_id: match.playerId,
    session_id: match.sessionId,
    stats_profile_id: match.profileId,
    client_match_id: match.clientId ?? match.id,
    started_at: match.startedAt,
    ended_at: match.endedAt ?? null,
    mode: match.mode as MatchInsert["mode"],
    difficulty: match.difficulty as MatchInsert["difficulty"],
    best_of: match.bestOf,
    rounds_played: match.rounds,
    score_you: match.score.you,
    score_ai: match.score.ai,
    ai_win_rate: match.aiWinRate ?? null,
    you_switched_rate: match.youSwitchedRate ?? null,
    leaderboard_score: match.leaderboardScore ?? null,
    leaderboard_max_streak: match.leaderboardMaxStreak ?? null,
    leaderboard_round_count: match.leaderboardRoundCount ?? null,
    leaderboard_timer_bonus: match.leaderboardTimerBonus ?? null,
    leaderboard_beat_confidence_bonus: match.leaderboardBeatConfidenceBonus ?? null,
    leaderboard_type: match.leaderboardType ?? null,
    notes: match.notes ?? null,
  };
  const rowId = asUuid(match.id);
  if (rowId) {
    row.id = rowId;
  }
  return row;
}

function rowToMatchSummary(row: MatchRow): MatchSummary | null {
  if (!row || !row.id || !row.session_id || !row.stats_profile_id || !row.user_id) {
    return null;
  }
  return {
    id: row.id,
    sessionId: row.session_id,
    clientId: row.client_match_id ?? undefined,
    playerId: row.user_id,
    profileId: row.stats_profile_id,
    startedAt: row.started_at,
    endedAt: row.ended_at ?? new Date().toISOString(),
    mode: row.mode as MatchSummary["mode"],
    bestOf: row.best_of as MatchSummary["bestOf"],
    difficulty: row.difficulty as MatchSummary["difficulty"],
    score: {
      you: row.score_you,
      ai: row.score_ai,
    },
    rounds: row.rounds_played,
    aiWinRate: row.ai_win_rate ?? 0,
    youSwitchedRate: row.you_switched_rate ?? 0,
    notes: row.notes ?? undefined,
    leaderboardScore: row.leaderboard_score ?? undefined,
    leaderboardMaxStreak: row.leaderboard_max_streak ?? undefined,
    leaderboardRoundCount: row.leaderboard_round_count ?? undefined,
    leaderboardTimerBonus: row.leaderboard_timer_bonus ?? undefined,
    leaderboardBeatConfidenceBonus: row.leaderboard_beat_confidence_bonus ?? undefined,
    leaderboardType:
      row.leaderboard_type === "Challenge" || row.leaderboard_type === "Practice Legacy"
        ? row.leaderboard_type
        : undefined,
  };
}

function aiStateRowToModel(row: AiStateRow): StoredPredictorModelState {
  return {
    profileId: row.stats_profile_id,
    modelVersion: row.model_version,
    updatedAt: row.updated_at,
    roundsSeen: row.rounds_seen,
    state: row.state as unknown as StoredPredictorModelState["state"],
  };
}

function sessionRowToCloudSession(row: SessionRow): CloudSession {
  return {
    id: row.id,
    userId: row.user_id,
    demographicsProfileId: row.demographics_profile_id,
    primaryStatsProfileId: row.primary_stats_profile_id,
    deviceId: row.device_id ?? undefined,
    clientSessionId: row.client_session_id ?? undefined,
    storageMode: row.storage_mode ?? undefined,
    startedAt: row.started_at,
    endedAt: row.ended_at ?? undefined,
    lastEventAt: row.last_event_at ?? undefined,
    sessionLabel: row.session_label ?? undefined,
    clientVersion: row.client_version ?? undefined,
    locale: row.locale ?? undefined,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    version: row.version ?? undefined,
  };
}

function sessionInputToRow(input: SessionUpsertInput): SessionInsert {
  const storageMode = input.storageMode ?? "cloud";

  return {
    id: input.id,
    user_id: input.userId,
    demographics_profile_id: input.demographicsProfileId ?? null,
    primary_stats_profile_id: input.primaryStatsProfileId ?? null,
    device_id: input.deviceId ?? null,
    client_session_id: input.clientSessionId ?? null,
    storage_mode: storageMode as SessionInsert["storage_mode"],
    started_at: input.startedAt,
    ended_at: input.endedAt ?? null,
    last_event_at: input.lastEventAt ?? null,
    session_label: input.sessionLabel ?? null,
    client_version: input.clientVersion ?? null,
    locale: input.locale ?? null,
    metadata: (input.metadata ?? {}) as SessionInsert["metadata"],
  };
}

function userSettingRowToModel(row: UserSettingRow): UserSetting {
  return {
    id: row.id,
    userId: row.user_id,
    statsProfileId: row.stats_profile_id ?? undefined,
    sessionId: row.session_id ?? undefined,
    scope: row.scope,
    key: row.key,
    value: row.value,
    version: row.version,
    createdAt: row.created_at ?? undefined,
    updatedAt: row.updated_at ?? undefined,
  };
}

function userSettingInputToRow(input: UserSettingUpsertInput): UserSettingInsert {
  return {
    id: input.id,
    user_id: input.userId,
    stats_profile_id: input.statsProfileId ?? null,
    session_id: input.sessionId ?? null,
    scope: (input.scope ?? "global") as UserSettingInsert["scope"],
    key: input.key,
    value: input.value as UserSettingInsert["value"],
    version: input.version ?? 1,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function normalizeErrorMessage(error: unknown): string {
  if (!error) return "Unknown error";
  if (typeof error === "string") {
    return error;
  }
  if (error instanceof Error) {
    return error.message || error.name;
  }
  const candidate = (error as { message?: unknown }).message;
  if (typeof candidate === "string" && candidate.trim().length > 0) {
    return candidate;
  }
  const details = (error as { details?: unknown }).details;
  if (typeof details === "string" && details.trim().length > 0) {
    return details;
  }
  try {
    return JSON.stringify(error);
  } catch {
    return "Unknown error";
  }
}

function extractStatus(error: unknown): number | undefined {
  const raw =
    (error as { status?: unknown })?.status ??
    (error as { statusCode?: unknown })?.statusCode ??
    (error as { httpStatus?: unknown })?.httpStatus;
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return raw;
  }
  if (typeof raw === "string") {
    const parsed = Number.parseInt(raw, 10);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return undefined;
}

function extractCode(error: unknown): string | undefined {
  const raw =
    (error as { code?: unknown })?.code ??
    (error as { error_code?: unknown })?.error_code ??
    (error as { sqlState?: unknown })?.sqlState;
  if (typeof raw === "string" && raw.trim().length > 0) {
    return raw;
  }
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return String(raw);
  }
  return undefined;
}

class SupabaseMutationError extends Error {
  readonly underlying: unknown;
  readonly status?: number;
  readonly code?: string;

  constructor(context: string, underlying: unknown) {
    const message = normalizeErrorMessage(underlying);
    super(`${context}: ${message}`);
    this.name = "SupabaseMutationError";
    this.underlying = underlying;
    this.status = extractStatus(underlying);
    this.code = extractCode(underlying);
  }
}

const MIN_QUEUE_DELAY_MS = 75;
const MAX_QUEUE_DELAY_MS = 200;
const MAX_RETRY_ATTEMPTS = 3;
const BASE_RETRY_DELAY_MS = 150;
const RETRY_JITTER_MS = 100;

function isNetworkError(error: unknown): boolean {
  if (!error) return false;
  const message = normalizeErrorMessage(error).toLowerCase();
  if (message.includes("network")) return true;
  if (message.includes("fetch failed")) return true;
  if (message.includes("failed to fetch")) return true;
  if (message.includes("timed out")) return true;
  const name = (error as { name?: unknown }).name;
  if (typeof name === "string") {
    const normalized = name.toLowerCase();
    if (normalized.includes("fetch") || normalized.includes("network")) {
      return true;
    }
  }
  return error instanceof TypeError;
}

class CloudWriteQueue {
  private tail: Promise<void> = Promise.resolve();

  enqueue<T>(task: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const runTask = async (): Promise<void> => {
        try {
          const result = await this.executeWithRetry(task);
          resolve(result);
        } catch (error) {
          reject(error);
        } finally {
          await this.delayBetweenRequests();
        }
      };

      this.tail = this.tail.then(runTask, runTask);
    });
  }

  private async executeWithRetry<T>(task: () => Promise<T>): Promise<T> {
    let attempt = 0;
    let lastError: unknown;
    while (attempt < MAX_RETRY_ATTEMPTS) {
      try {
        return await task();
      } catch (error) {
        lastError = error;
        attempt += 1;
        if (attempt >= MAX_RETRY_ATTEMPTS || !this.shouldRetry(error)) {
          throw error;
        }
        const backoffDelay = this.computeBackoffDelay(attempt - 1);
        await sleep(backoffDelay);
      }
    }
    throw lastError;
  }

  private shouldRetry(error: unknown): boolean {
    const candidate = error instanceof SupabaseMutationError ? error : null;
    const code = candidate?.code;
    const status = candidate?.status;
    if (code === "409" || status === 409) {
      return true;
    }
    if (code === "23503" || code === "23505") {
      return true;
    }
    if (isNetworkError(candidate?.underlying ?? error)) {
      return true;
    }
    return false;
  }

  private computeBackoffDelay(attemptIndex: number): number {
    const base = BASE_RETRY_DELAY_MS * 2 ** attemptIndex;
    const jitter = Math.random() * RETRY_JITTER_MS;
    return base + jitter;
  }

  private async delayBetweenRequests(): Promise<void> {
    const span = MAX_QUEUE_DELAY_MS - MIN_QUEUE_DELAY_MS;
    const delay = MIN_QUEUE_DELAY_MS + Math.random() * (span > 0 ? span : 0);
    await sleep(delay);
  }
}

const cloudWriteQueue = new CloudWriteQueue();

function ensureClient(client: SupabaseClient | null | undefined): SupabaseClient {
  if (!client) {
    throw new Error("Supabase client is not configured");
  }
  return client;
}

async function handleMaybeSingle<Row>(
  query: unknown,
  context: string,
): Promise<Row | null> {
  const { data, error } = (await (query as Promise<{ data: unknown; error: unknown }>)) || {};
  if (error) {
    throw new Error(`${context}: ${String(error)}`);
  }
  if (!data) return null;
  return data as Row;
}

async function handleSelect<Row>(
  query: unknown,
  context: string,
): Promise<Row[]> {
  const { data, error } = (await (query as Promise<{ data: unknown; error: unknown }>)) || {};
  if (error) {
    throw new Error(`${context}: ${String(error)}`);
  }
  if (!Array.isArray(data)) {
    return [];
  }
  return data as Row[];
}

async function handleMutation(
  mutationFactory: () => Promise<{ error?: unknown } | null | undefined>,
  context: string,
): Promise<void> {
  await cloudWriteQueue.enqueue(async () => {
    try {
      const result = (await mutationFactory()) || {};
      const { error } = result;
      if (error) {
        throw new SupabaseMutationError(context, error);
      }
    } catch (error) {
      if (error instanceof SupabaseMutationError) {
        throw error;
      }
      throw new SupabaseMutationError(context, error);
    }
  });
}

export class CloudDataService {
  constructor(private readonly client: SupabaseClient) {}

  async selectDemographicsProfileRow(userId: string): Promise<DemographicsProfileRow | null> {
    const client = ensureClient(this.client);
    const query = client
      .from("demographics_profiles")
      .select(
        "user_id, username, first_name, last_initial, grade, school, created_at, age, prior_experience, training_completed, training_count, consent_version, consent_granted_at, last_promoted_at",
      )
      .eq("user_id", userId)
      .maybeSingle();
    return handleMaybeSingle<DemographicsProfileRow>(query, "select demographics profile");
  }

  async loadPlayerProfile(userId: string): Promise<PlayerProfile | null> {
    const row = await this.selectDemographicsProfileRow(userId);
    if (!row) return null;
    return demographicsRowToPlayerProfile(row);
  }

  async listDeveloperRoomPlayers(): Promise<DeveloperRoomPlayerOverview[]> {
    const client = ensureClient(this.client);
    const query = client
      .from("developer_room_player_overview")
      .select(
        "player_id, player_name, first_name, last_initial, username, grade, age_text, age_numeric, school, prior_experience, training_completed, training_count, consent_version, consent_granted_at, last_promoted_at, created_at, updated_at, storage_mode, has_demographics, needs_review, profile_count, match_count, round_count, last_profile_updated_at, last_match_at, last_round_at, last_played_at, last_activity_at",
      );
    const rows = await handleSelect<DeveloperRoomPlayerOverviewRow>(
      query,
      "select developer room player overview",
    );
    return rows.map(developerOverviewRowToOverview);
  }

  async upsertPlayerProfile(profile: PlayerProfile): Promise<void> {
    const client = ensureClient(this.client);
    const payload = playerProfileToDemographicsUpsert(profile);
    await handleMutation(
      () => client.from("demographics_profiles").upsert(payload),
      "upsert demographics profile",
    );
  }

  async selectStatsProfileRows(userId: string): Promise<StatsProfileRow[]> {
    const client = ensureClient(this.client);
    const query = client
      .from("stats_profiles")
      .select(
        "id, user_id, demographics_profile_id, base_name, profile_version, display_name, training_count, training_completed, predictor_default, seen_post_training_cta, previous_profile_id, next_profile_id, archived, metadata, created_at, updated_at, version",
      )
      .eq("user_id", userId);
    const rows = await handleSelect<StatsProfileRow>(query, "select stats profiles");
    return rows;
  }

  async loadStatsProfiles(userId: string): Promise<StatsProfile[]> {
    const rows = await this.selectStatsProfileRows(userId);
    const mapped = rows
      .map(statsProfileRowToStatsProfile)
      .filter((entry): entry is StatsProfile => Boolean(entry));
    mapped.sort((a, b) => a.created_at.localeCompare(b.created_at));
    return mapped;
  }

  async upsertStatsProfile(profile: StatsProfile): Promise<void> {
    const client = ensureClient(this.client);
    const payload = statsProfileToUpsert(profile);
    await handleMutation(
      () =>
        client
          .from("stats_profiles")
          .upsert(payload, { onConflict: "user_id,base_name,profile_version" }),
      "upsert stats profile",
    );
  }

  async insertRounds(rounds: RoundInsertInput[]): Promise<void> {
    if (rounds.length === 0) return;
    const client = ensureClient(this.client);
    const payload = rounds.map(roundLogToRow);
    const withPrimaryKey = payload.filter(
      (row): row is RoundInsert & { id: string } => typeof row.id === "string" && row.id.length > 0,
    );
    const withoutPrimaryKey = payload.filter(row => !row.id);

    if (withPrimaryKey.length > 0) {
      await handleMutation(
        () => client.from("rounds").upsert(withPrimaryKey as any, { onConflict: "id" }),
        "upsert rounds",
      );
    }

    if (withoutPrimaryKey.length > 0) {
      await handleMutation(
        () => (client.from("rounds") as any).insert(withoutPrimaryKey as any),
        "insert rounds",
      );
    }
  }

  async updateRoundFields(
    userId: string,
    roundId: string,
    patch: Partial<RoundRow>,
  ): Promise<void> {
    if (!patch || Object.keys(patch).length === 0) return;
    const client = ensureClient(this.client);
    await handleMutation(
      () =>
        (client
          .from("rounds") as any)
          .update(patch as any)
          .eq("user_id", userId)
          .or(`client_round_id.eq.${roundId},id.eq.${roundId}`),
      "update round",
    );
  }

  async deleteRound(userId: string, roundId: string): Promise<void> {
    const client = ensureClient(this.client);
    await handleMutation(
      () =>
        (client
          .from("rounds") as any)
          .delete()
          .eq("user_id", userId)
          .or(`client_round_id.eq.${roundId},id.eq.${roundId}`),
      "delete round",
    );
  }

  async loadRounds(userId: string, statsProfileId: string): Promise<RoundLog[]> {
    const client = ensureClient(this.client);
    const query = client
      .from("rounds")
      .select(
        "id, user_id, session_id, stats_profile_id, match_id, client_round_id, round_number, played_at, mode, difficulty, best_of, player_move, ai_move, predicted_player_move, outcome, decision_policy, reason, ai_confidence, confidence_bucket, decision_time_ms, streak_ai, streak_you, mixer_trace, heuristic_trace",
      )
      .eq("user_id", userId)
      .eq("stats_profile_id", statsProfileId)
      .order("played_at", { ascending: true })
      .order("round_number", { ascending: true });
    const rows = await handleSelect<RoundRow>(query, "select rounds");
    return rows
      .map(rowToRoundLog)
      .filter((entry): entry is RoundLog => Boolean(entry));
  }

  async insertMatches(matches: MatchSummary[]): Promise<void> {
    if (matches.length === 0) return;
    const client = ensureClient(this.client);
    const payload = matches.map(matchSummaryToRow);
    const withPrimaryKey = payload.filter(
      (row): row is MatchInsert & { id: string } => typeof row.id === "string" && row.id.length > 0,
    );
    const withoutPrimaryKey = payload.filter(row => !row.id);

    if (withPrimaryKey.length > 0) {
      await handleMutation(
        () => client.from("matches").upsert(withPrimaryKey as any, { onConflict: "id" }),
        "upsert matches",
      );
    }

    if (withoutPrimaryKey.length > 0) {
      await handleMutation(
        () => (client.from("matches") as any).insert(withoutPrimaryKey as any),
        "insert matches",
      );
    }
  }

  async updateMatchFields(
    userId: string,
    matchId: string,
    patch: Partial<MatchRow>,
  ): Promise<void> {
    if (!patch || Object.keys(patch).length === 0) return;
    const client = ensureClient(this.client);
    await handleMutation(
      () =>
        (client
          .from("matches") as any)
          .update(patch as any)
          .eq("user_id", userId)
          .or(`client_match_id.eq.${matchId},id.eq.${matchId}`),
      "update match",
    );
  }

  async deleteMatch(userId: string, matchId: string): Promise<void> {
    const client = ensureClient(this.client);
    await handleMutation(
      () =>
        (client
          .from("matches") as any)
          .delete()
          .eq("user_id", userId)
          .or(`client_match_id.eq.${matchId},id.eq.${matchId}`),
      "delete match",
    );
  }

  async loadMatches(userId: string, statsProfileId: string): Promise<MatchSummary[]> {
    const client = ensureClient(this.client);
    const query = client
      .from("matches")
      .select(
        "id, user_id, session_id, stats_profile_id, client_match_id, started_at, ended_at, mode, difficulty, best_of, rounds_played, score_you, score_ai, ai_win_rate, you_switched_rate, leaderboard_score, leaderboard_max_streak, leaderboard_round_count, leaderboard_timer_bonus, leaderboard_beat_confidence_bonus, leaderboard_type, notes",
      )
      .eq("user_id", userId)
      .eq("stats_profile_id", statsProfileId)
      .order("started_at", { ascending: true })
      .order("ended_at", { ascending: true });
    const rows = await handleSelect<MatchRow>(query, "select matches");
    return rows
      .map(rowToMatchSummary)
      .filter((entry): entry is MatchSummary => Boolean(entry));
  }

  async loadPublicLeaderboard(): Promise<LeaderboardMatchEntry[]> {
    const client = ensureClient(this.client);
    const query = client
      .from("leaderboard_public_entries")
      .select(
        "global_rank, match_id, player_id, player_name, grade, total_score, max_streak, rounds_played, mode, difficulty, ended_at, stats_profile_id",
      )
      .order("global_rank", { ascending: true });
    type PublicLeaderboardRow = {
      global_rank?: number | string | null;
      match_id?: string | null;
      player_id?: string | null;
      stats_profile_id?: string | null;
      player_name?: string | null;
      grade?: string | null;
      total_score?: number | string | null;
      max_streak?: number | string | null;
      rounds_played?: number | string | null;
      mode?: string | null;
      difficulty?: string | null;
      ended_at?: string | null;
    };
    const rows = await handleSelect<PublicLeaderboardRow>(query, "select public leaderboard entries");
    const entries: LeaderboardMatchEntry[] = [];
    rows.forEach(row => {
      const matchId = typeof row.match_id === "string" && row.match_id.trim().length > 0 ? row.match_id : null;
      const playerId = typeof row.player_id === "string" && row.player_id.trim().length > 0 ? row.player_id : null;
      const endedAt = typeof row.ended_at === "string" && row.ended_at.trim().length > 0 ? row.ended_at : null;
      if (!matchId || !playerId || !endedAt) {
        return;
      }
      const endedDate = new Date(endedAt);
      if (Number.isNaN(endedDate.getTime())) {
        return;
      }
      const scoreCandidate = parseNumber(row.total_score);
      if (scoreCandidate == null || scoreCandidate <= 0) {
        return;
      }
      const streak = parseNonNegativeInteger(row.max_streak, 0);
      const rounds = parseNonNegativeInteger(row.rounds_played, 0);
      const mode = asMode(row.mode) ?? "challenge";
      const difficulty = asAIMode(row.difficulty) ?? "normal";
      const rawName = typeof row.player_name === "string" ? row.player_name.trim() : "";
      const playerName = rawName.length > 0 ? rawName : "Player";
      const gradeCandidate = typeof row.grade === "string" ? row.grade.trim() : null;
      const grade = isGrade(gradeCandidate) ? gradeCandidate : undefined;
      const profileId = typeof row.stats_profile_id === "string" && row.stats_profile_id.trim().length > 0
        ? row.stats_profile_id
        : playerId;
      entries.push({
        matchId,
        matchKey: matchId,
        playerId,
        profileId,
        playerName,
        grade,
        score: scoreCandidate,
        streak,
        rounds,
        mode,
        difficulty,
        endedAt,
        endedAtMs: endedDate.getTime(),
      });
    });
    return entries;
  }

  async upsertAiState(input: AiStateUpsertInput): Promise<void> {
    const client = ensureClient(this.client);
    const stateVersion = (input.state as { version?: unknown }).version;
    const rawVersion =
      typeof input.version === "number"
        ? input.version
        : typeof stateVersion === "number"
          ? stateVersion
          : undefined;
    const version =
      typeof rawVersion === "number" && Number.isFinite(rawVersion)
        ? Math.max(1, Math.floor(rawVersion))
        : 1;
    const payload: AiStateInsert = {
      id: input.id,
      user_id: input.userId,
      stats_profile_id: input.profileId,
      model_version: input.modelVersion,
      rounds_seen: input.roundsSeen,
      state: input.state as unknown as AiStateInsert["state"],
      needs_rebuild: input.needsRebuild ?? false,
      last_round_id: input.lastRoundId ?? null,
      version,
      updated_at: input.updatedAt,
    };
    await handleMutation(() => client.from("ai_states").upsert(payload as any), "upsert ai state");
  }

  async deleteAiState(userId: string, statsProfileId: string): Promise<void> {
    const client = ensureClient(this.client);
    await handleMutation(
      () =>
        (client
          .from("ai_states") as any)
          .delete()
          .eq("user_id", userId)
          .eq("stats_profile_id", statsProfileId),
      "delete ai state",
    );
  }

  async loadAiState(userId: string, statsProfileId: string): Promise<StoredPredictorModelState | null> {
    const client = ensureClient(this.client);
    const query = client
      .from("ai_states")
      .select("id, user_id, stats_profile_id, model_version, rounds_seen, state, needs_rebuild, last_round_id, version, updated_at")
      .eq("user_id", userId)
      .eq("stats_profile_id", statsProfileId)
      .maybeSingle();
    const row = await handleMaybeSingle<AiStateRow>(query, "select ai state");
    if (!row) return null;
    return aiStateRowToModel(row);
  }

  async upsertSession(input: SessionUpsertInput): Promise<void> {
    const client = ensureClient(this.client);
    const payload = sessionInputToRow(input);
    await handleMutation(() => client.from("sessions").upsert(payload as any), "upsert session");
  }

  async loadSessions(userId: string): Promise<CloudSession[]> {
    const client = ensureClient(this.client);
    const query = client
      .from("sessions")
      .select(
        "id, user_id, demographics_profile_id, primary_stats_profile_id, device_id, client_session_id, storage_mode, started_at, ended_at, last_event_at, session_label, client_version, locale, metadata, version",
      )
      .eq("user_id", userId);
    const rows = await handleSelect<SessionRow>(query, "select sessions");
    return rows.map(sessionRowToCloudSession);
  }

  async loadUserSettings(userId: string, key?: string): Promise<UserSetting[]> {
    const client = ensureClient(this.client);
    let builder = client
      .from("user_settings")
      .select("id, user_id, stats_profile_id, session_id, scope, key, value, version, created_at, updated_at")
      .eq("user_id", userId);
    if (key) {
      builder = builder.eq("key", key);
    }
    const rows = await handleSelect<UserSettingRow>(builder, "select user settings");
    return rows.map(userSettingRowToModel);
  }

  async upsertUserSetting(input: UserSettingUpsertInput): Promise<void> {
    const client = ensureClient(this.client);
    const payload = userSettingInputToRow(input);
    await handleMutation(() => client.from("user_settings").upsert(payload as any), "upsert user setting");
  }
}

export function createCloudDataService(client: SupabaseClient): CloudDataService {
  return new CloudDataService(client);
}

export const cloudDataService = supabaseClient ? new CloudDataService(supabaseClient) : null;

export type {
  DemographicsProfileRow as DemographicsProfileRecord,
  StatsProfileRow as StatsProfileRecord,
  RoundRow as RoundRecord,
  MatchRow as MatchRecord,
  AiStateRow as AiStateRecord,
  SessionRow as SessionRecord,
  UserSettingRow as UserSettingRecord,
};

export const converters = {
  demographicsRowToPlayerProfile,
  playerProfileToDemographicsUpsert,
  statsProfileRowToStatsProfile,
  statsProfileToUpsert,
  roundLogToRow,
  rowToRoundLog,
  matchSummaryToRow,
  rowToMatchSummary,
  aiStateRowToModel,
  sessionRowToCloudSession,
  sessionInputToRow,
  userSettingRowToModel,
  userSettingInputToRow,
};
