import { supabaseClient, type SupabaseClient } from "./supabaseClient";
import type { PlayerProfile, Grade } from "../players";
import { CONSENT_TEXT_VERSION, GRADE_OPTIONS, sanitizeAge } from "../players";
import type {
  MatchSummary,
  RoundLog,
  StatsProfile,
  StoredPredictorModelState,
} from "../stats";

type Maybe<T> = T | null | undefined;

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

export interface DemographicsProfileRow {
  user_id: string;
  username: string | null;
  first_name: string | null;
  last_initial: string | null;
  grade: string | null;
  school: string | null;
  created_at: string | null;
  age: string | null;
  prior_experience: string | null;
  training_completed: boolean | null;
  training_count: number | null;
  storage_mode?: string | null;
  updated_at?: string | null;
  preferences?: unknown;
  consent_version: string | null;
  consent_granted_at: string | null;
  last_promoted_at?: string | null;
}

export type DemographicsProfileUpsert = Pick<
  DemographicsProfileRow,
  | "user_id"
  | "username"
  | "first_name"
  | "last_initial"
  | "grade"
  | "school"
  | "age"
  | "prior_experience"
  | "consent_version"
  | "consent_granted_at"
  | "training_completed"
  | "training_count"
>;

export interface StatsProfileRow {
  id: string;
  user_id: string;
  demographics_profile_id: string | null;
  base_name: string | null;
  profile_version: number | null;
  display_name: string | null;
  training_count: number | null;
  training_completed: boolean | null;
  predictor_default: boolean | null;
  seen_post_training_cta: boolean | null;
  previous_profile_id: string | null;
  next_profile_id: string | null;
  archived: boolean | null;
  metadata?: unknown;
  created_at: string | null;
  updated_at?: string | null;
  version: number | null;
}

export type StatsProfileUpsert = Pick<
  StatsProfileRow,
  | "id"
  | "user_id"
  | "base_name"
  | "display_name"
  | "training_count"
  | "training_completed"
  | "predictor_default"
  | "seen_post_training_cta"
  | "previous_profile_id"
  | "next_profile_id"
  | "archived"
  | "version"
  | "profile_version"
> & { created_at?: string };

export interface RoundRow {
  id?: string;
  user_id: string;
  session_id: string;
  stats_profile_id: string;
  match_id: string | null;
  client_round_id: string | null;
  round_number: number;
  played_at: string;
  mode: string;
  difficulty: string;
  best_of: number;
  player_move: string;
  ai_move: string;
  predicted_player_move: string | null;
  outcome: string;
  decision_policy: string;
  reason: string | null;
  ai_confidence: number | null;
  confidence_bucket: string | null;
  decision_time_ms: number | null;
  response_time_ms?: number | null;
  response_speed_ms?: number | null;
  inter_round_delay_ms?: number | null;
  ready_at?: string | null;
  first_interaction_at?: string | null;
  move_selected_at?: string | null;
  completed_at?: string | null;
  interactions?: number | null;
  clicks?: number | null;
  streak_ai: number | null;
  streak_you: number | null;
  ai_state?: unknown;
  mixer_trace: unknown;
  heuristic_trace: unknown;
  metadata?: unknown;
  created_at?: string | null;
  updated_at?: string | null;
  version?: number | null;
}

export interface RoundInsertInput {
  round: RoundLog;
  roundNumber: number;
}

export interface MatchRow {
  id?: string;
  user_id: string;
  session_id: string;
  stats_profile_id: string;
  client_match_id: string | null;
  started_at: string;
  ended_at: string | null;
  mode: string;
  difficulty: string;
  best_of: number;
  rounds_played: number;
  score_you: number;
  score_ai: number;
  ai_win_rate: number | null;
  you_switched_rate: number | null;
  leaderboard_score: number | null;
  leaderboard_max_streak: number | null;
  leaderboard_round_count: number | null;
  leaderboard_timer_bonus: number | null;
  leaderboard_beat_confidence_bonus: number | null;
  leaderboard_type: string | null;
  notes: string | null;
  metadata?: unknown;
  created_at?: string | null;
  updated_at?: string | null;
  version?: number | null;
}

export interface AiStateRow {
  id?: string;
  user_id: string;
  stats_profile_id: string;
  model_version: number;
  rounds_seen: number;
  state: unknown;
  needs_rebuild: boolean;
  last_round_id: string | null;
  version: number | null;
  created_at?: string | null;
  updated_at: string;
}

export type AiStateUpsertInput = StoredPredictorModelState & {
  userId: string;
  needsRebuild?: boolean;
  lastRoundId?: string | null;
  id?: string;
};

export interface SessionRow {
  id?: string;
  user_id: string;
  demographics_profile_id: string | null;
  primary_stats_profile_id: string | null;
  device_id: string | null;
  client_session_id: string | null;
  storage_mode: string | null;
  started_at: string;
  ended_at: string | null;
  last_event_at: string | null;
  session_label: string | null;
  client_version: string | null;
  locale: string | null;
  metadata: unknown;
  created_at?: string | null;
  updated_at?: string | null;
  version?: number | null;
}

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

export interface UserSettingRow {
  id?: string;
  user_id: string;
  stats_profile_id: string | null;
  session_id: string | null;
  scope: string;
  key: string;
  value: unknown;
  version: number;
  created_at?: string | null;
  updated_at?: string | null;
  profile_scope_id?: string | null;
  session_scope_id?: string | null;
}

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
    training_completed: profile.needsReview ? null : true,
    training_count: null,
  };
}

function statsProfileRowToStatsProfile(row: StatsProfileRow): StatsProfile | null {
  if (!row || typeof row !== "object") return null;
  if (!row.id || !row.user_id) return null;
  if (row.archived) return null;
  const createdAt = coerceTimestamp(row.created_at);
  const baseName = row.base_name?.trim() || "primary";
  const displayName = row.display_name?.trim() || baseName || "Primary";
  const rawVersion = Number.isFinite(row.version)
    ? Number(row.version)
    : Number.isFinite(row.profile_version)
      ? Number(row.profile_version)
      : 1;
  const version = Math.max(1, Math.floor(rawVersion));
  const trainingCount = typeof row.training_count === "number" ? row.training_count : 0;
  const trained = row.training_completed === true;
  const predictorDefault = row.predictor_default === true;
  const seenCTA = row.seen_post_training_cta === true;

  return {
    id: row.id,
    playerId: row.user_id,
    name: displayName,
    createdAt,
    trainingCount,
    trained,
    predictorDefault,
    seenPostTrainingCTA: seenCTA,
    baseName,
    version,
    previousProfileId: row.previous_profile_id,
    nextProfileId: row.next_profile_id,
  };
}

function statsProfileToUpsert(profile: StatsProfile): StatsProfileUpsert {
  return {
    id: profile.id,
    user_id: profile.playerId,
    base_name: profile.baseName,
    display_name: profile.name,
    training_count: profile.trainingCount,
    training_completed: profile.trained,
    predictor_default: profile.predictorDefault,
    seen_post_training_cta: profile.seenPostTrainingCTA,
    previous_profile_id: profile.previousProfileId ?? null,
    next_profile_id: profile.nextProfileId ?? null,
    archived: false,
    version: profile.version,
    profile_version: profile.version,
    created_at: profile.createdAt,
  };
}

function roundLogToRow({ round, roundNumber }: RoundInsertInput): RoundRow {
  const predicted =
    round.policy === "mixer"
      ? round.mixer?.counter ?? null
      : round.heuristic?.predicted ?? null;
  return {
    user_id: round.playerId,
    session_id: round.sessionId,
    stats_profile_id: round.profileId,
    match_id: round.matchId ?? null,
    client_round_id: round.id,
    round_number: roundNumber,
    played_at: round.t,
    mode: round.mode,
    difficulty: round.difficulty,
    best_of: round.bestOf,
    player_move: round.player,
    ai_move: round.ai,
    predicted_player_move: predicted,
    outcome: round.outcome,
    decision_policy: round.policy,
    reason: round.reason ?? null,
    ai_confidence: round.confidence ?? null,
    confidence_bucket: round.confidenceBucket ?? null,
    decision_time_ms: round.decisionTimeMs ?? null,
    streak_ai: Number.isFinite(round.streakAI) ? round.streakAI : null,
    streak_you: Number.isFinite(round.streakYou) ? round.streakYou : null,
    mixer_trace: round.mixer ?? null,
    heuristic_trace: round.heuristic ?? null,
  };
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

function matchSummaryToRow(match: MatchSummary): MatchRow {
  return {
    id: match.id,
    user_id: match.playerId,
    session_id: match.sessionId,
    stats_profile_id: match.profileId,
    client_match_id: match.clientId ?? match.id,
    started_at: match.startedAt,
    ended_at: match.endedAt ?? null,
    mode: match.mode,
    difficulty: match.difficulty,
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
    state: row.state as StoredPredictorModelState["state"],
  };
}

function sessionRowToCloudSession(row: SessionRow & { id: string }): CloudSession {
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

function sessionInputToRow(input: SessionUpsertInput): SessionRow {
  return {
    id: input.id,
    user_id: input.userId,
    demographics_profile_id: input.demographicsProfileId ?? null,
    primary_stats_profile_id: input.primaryStatsProfileId ?? null,
    device_id: input.deviceId ?? null,
    client_session_id: input.clientSessionId ?? null,
    storage_mode: input.storageMode ?? null,
    started_at: input.startedAt,
    ended_at: input.endedAt ?? null,
    last_event_at: input.lastEventAt ?? null,
    session_label: input.sessionLabel ?? null,
    client_version: input.clientVersion ?? null,
    locale: input.locale ?? null,
    metadata: input.metadata ?? {},
  };
}

function userSettingRowToModel(row: UserSettingRow & { id: string }): UserSetting {
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

function userSettingInputToRow(input: UserSettingUpsertInput): UserSettingRow {
  return {
    id: input.id,
    user_id: input.userId,
    stats_profile_id: input.statsProfileId ?? null,
    session_id: input.sessionId ?? null,
    scope: input.scope ?? "global",
    key: input.key,
    value: input.value,
    version: input.version ?? 1,
  };
}

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
  mutation: unknown,
  context: string,
): Promise<void> {
  const { error } = (await (mutation as Promise<{ error: unknown }>)) || {};
  if (error) {
    throw new Error(`${context}: ${String(error)}`);
  }
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

  async upsertPlayerProfile(profile: PlayerProfile): Promise<void> {
    const client = ensureClient(this.client);
    const payload = playerProfileToDemographicsUpsert(profile);
    const mutation = client.from("demographics_profiles").upsert(payload);
    await handleMutation(mutation, "upsert demographics profile");
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
    mapped.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    return mapped;
  }

  async upsertStatsProfile(profile: StatsProfile): Promise<void> {
    const client = ensureClient(this.client);
    const payload = statsProfileToUpsert(profile);
    const mutation = client.from("stats_profiles").upsert(payload);
    await handleMutation(mutation, "upsert stats profile");
  }

  async insertRounds(rounds: RoundInsertInput[]): Promise<void> {
    if (rounds.length === 0) return;
    const client = ensureClient(this.client);
    const payload = rounds.map(roundLogToRow);
    const mutation = client
      .from("rounds")
      .upsert(payload as any, { onConflict: "client_round_id" });
    await handleMutation(mutation, "insert rounds");
  }

  async updateRoundFields(
    userId: string,
    roundId: string,
    patch: Partial<RoundRow>,
  ): Promise<void> {
    if (!patch || Object.keys(patch).length === 0) return;
    const client = ensureClient(this.client);
    const mutation = (client
      .from("rounds") as any)
      .update(patch as any)
      .eq("user_id", userId)
      .or(`client_round_id.eq.${roundId},id.eq.${roundId}`);
    await handleMutation(mutation, "update round");
  }

  async deleteRound(userId: string, roundId: string): Promise<void> {
    const client = ensureClient(this.client);
    const mutation = (client
      .from("rounds") as any)
      .delete()
      .eq("user_id", userId)
      .or(`client_round_id.eq.${roundId},id.eq.${roundId}`);
    await handleMutation(mutation, "delete round");
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
    const mutation = client
      .from("matches")
      .upsert(payload as any, { onConflict: "client_match_id" });
    await handleMutation(mutation, "insert matches");
  }

  async updateMatchFields(
    userId: string,
    matchId: string,
    patch: Partial<MatchRow>,
  ): Promise<void> {
    if (!patch || Object.keys(patch).length === 0) return;
    const client = ensureClient(this.client);
    const mutation = (client
      .from("matches") as any)
      .update(patch as any)
      .eq("user_id", userId)
      .or(`client_match_id.eq.${matchId},id.eq.${matchId}`);
    await handleMutation(mutation, "update match");
  }

  async deleteMatch(userId: string, matchId: string): Promise<void> {
    const client = ensureClient(this.client);
    const mutation = (client
      .from("matches") as any)
      .delete()
      .eq("user_id", userId)
      .or(`client_match_id.eq.${matchId},id.eq.${matchId}`);
    await handleMutation(mutation, "delete match");
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

  async upsertAiState(input: AiStateUpsertInput): Promise<void> {
    const client = ensureClient(this.client);
    const payload: AiStateRow = {
      id: input.id,
      user_id: input.userId,
      stats_profile_id: input.profileId,
      model_version: input.modelVersion,
      rounds_seen: input.roundsSeen,
      state: input.state,
      needs_rebuild: input.needsRebuild ?? false,
      last_round_id: input.lastRoundId ?? null,
      version: null,
      updated_at: input.updatedAt,
    };
    const mutation = client.from("ai_states").upsert(payload as any);
    await handleMutation(mutation, "upsert ai state");
  }

  async deleteAiState(userId: string, statsProfileId: string): Promise<void> {
    const client = ensureClient(this.client);
    const mutation = (client
      .from("ai_states") as any)
      .delete()
      .eq("user_id", userId)
      .eq("stats_profile_id", statsProfileId);
    await handleMutation(mutation, "delete ai state");
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
    const mutation = client.from("sessions").upsert(payload as any);
    await handleMutation(mutation, "upsert session");
  }

  async loadSessions(userId: string): Promise<CloudSession[]> {
    const client = ensureClient(this.client);
    const query = client
      .from("sessions")
      .select(
        "id, user_id, demographics_profile_id, primary_stats_profile_id, device_id, client_session_id, storage_mode, started_at, ended_at, last_event_at, session_label, client_version, locale, metadata, version",
      )
      .eq("user_id", userId);
    const rows = await handleSelect<SessionRow & { id: string }>(query, "select sessions");
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
    const rows = await handleSelect<UserSettingRow & { id: string }>(builder, "select user settings");
    return rows.map(userSettingRowToModel);
  }

  async upsertUserSetting(input: UserSettingUpsertInput): Promise<void> {
    const client = ensureClient(this.client);
    const payload = userSettingInputToRow(input);
    const mutation = client.from("user_settings").upsert(payload as any);
    await handleMutation(mutation, "upsert user setting");
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
