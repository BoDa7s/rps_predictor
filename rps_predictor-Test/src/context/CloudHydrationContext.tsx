import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { useAuth } from "./AuthContext";
import { useLocalMode } from "./LocalModeContext";
import { isSupabaseConfigured, supabaseClient } from "../lib/supabaseClient";
import { CLOUD_SYNC_FEATURE_FLAG } from "../lib/featureFlags";
import {
  AiStateRecord,
  CLOUD_ROUND_LIMIT,
  RoundRecord,
  SessionRecord,
  StatsCounterRecord,
  StatsProfileRecord,
} from "../lib/dataContracts";

export type CloudHydrationStatus = "disabled" | "idle" | "hydrating" | "hydrated" | "error";

export interface CloudHydrationResult {
  status: CloudHydrationStatus;
  error: Error | null;
}

type LandingPath = "/training" | "/modes" | null;

interface CloudHydrationState {
  status: CloudHydrationStatus;
  session: SessionRecord | null;
  statsProfiles: StatsProfileRecord[];
  primaryProfile: StatsProfileRecord | null;
  rounds: RoundRecord[];
  aiState: AiStateRecord | null;
  fastStats: StatsCounterRecord[];
  clientSessionId: string | null;
  landingPath: LandingPath;
  error: Error | null;
  refresh: () => Promise<CloudHydrationResult>;
  consumeLandingPath: () => void;
}

const INITIAL_STATE: CloudHydrationState = {
  status: "disabled",
  session: null,
  statsProfiles: [],
  primaryProfile: null,
  rounds: [],
  aiState: null,
  fastStats: [],
  clientSessionId: null,
  landingPath: null,
  error: null,
  refresh: async () => ({ status: "disabled", error: null }),
  consumeLandingPath: () => undefined,
};

const CloudHydrationContext = createContext<CloudHydrationState>(INITIAL_STATE);

const CLIENT_SESSION_STORAGE_KEY = "rps_cloud_client_session_id";
const FAST_STAT_KEYS = [
  "winrate_overall",
  "move_frequency_rock",
  "move_frequency_paper",
  "move_frequency_scissors",
] as const;

function makeClientSessionId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `sess-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function loadClientSessionId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = window.localStorage.getItem(CLIENT_SESSION_STORAGE_KEY);
    if (stored && stored.trim()) {
      return stored;
    }
    const generated = makeClientSessionId();
    window.localStorage.setItem(CLIENT_SESSION_STORAGE_KEY, generated);
    return generated;
  } catch (error) {
    console.warn("Unable to access localStorage for session id", error);
    return makeClientSessionId();
  }
}

export function CloudHydrationProvider({ children }: { children: React.ReactNode }): JSX.Element {
  const { user, profile } = useAuth();
  const { localModeEnabled } = useLocalMode();
  const [status, setStatus] = useState<CloudHydrationStatus>("disabled");
  const [session, setSession] = useState<SessionRecord | null>(null);
  const [statsProfiles, setStatsProfiles] = useState<StatsProfileRecord[]>([]);
  const [primaryProfile, setPrimaryProfile] = useState<StatsProfileRecord | null>(null);
  const [rounds, setRounds] = useState<RoundRecord[]>([]);
  const [aiState, setAiState] = useState<AiStateRecord | null>(null);
  const [fastStats, setFastStats] = useState<StatsCounterRecord[]>([]);
  const [error, setError] = useState<Error | null>(null);
  const [landingPath, setLandingPath] = useState<LandingPath>(null);
  const landingConsumedRef = useRef(false);
  const [clientSessionId, setClientSessionId] = useState<string | null>(() => loadClientSessionId());
  const hydratingRef = useRef(false);
  const subscriptionRef = useRef<RealtimeChannel | null>(null);

  const supabaseAvailable = useMemo(
    () => CLOUD_SYNC_FEATURE_FLAG && isSupabaseConfigured && Boolean(supabaseClient),
    [],
  );

  const shouldEnableCloud = Boolean(
    supabaseAvailable && user && !localModeEnabled,
  );

  useEffect(() => {
    if (!supabaseAvailable) {
      setStatus("disabled");
      setSession(null);
      setStatsProfiles([]);
      setPrimaryProfile(null);
      setRounds([]);
      setAiState(null);
      setFastStats([]);
      setLandingPath(null);
      landingConsumedRef.current = false;
    }
  }, [supabaseAvailable]);

  useEffect(() => {
    if (!shouldEnableCloud) {
      if (!user) {
        setStatus("disabled");
      } else {
        setStatus("idle");
      }
      setSession(null);
      setStatsProfiles([]);
      setPrimaryProfile(null);
      setRounds([]);
      setAiState(null);
      setFastStats([]);
      setLandingPath(null);
      landingConsumedRef.current = false;
      setError(null);
      return;
    }
    setStatus(prev => (prev === "hydrated" ? prev : "idle"));
  }, [shouldEnableCloud, user]);

  const resolveClientSessionId = useCallback((): string => {
    let resolved = clientSessionId;
    if (!resolved || !resolved.trim()) {
      resolved = loadClientSessionId();
      setClientSessionId(resolved);
    }
    return resolved ?? makeClientSessionId();
  }, [clientSessionId]);

  const hydrate = useCallback(async (): Promise<CloudHydrationResult> => {
    if (!supabaseClient || !user) {
      return { status: "disabled", error: null };
    }
    if (hydratingRef.current) {
      return { status, error };
    }
    hydratingRef.current = true;
    setStatus("hydrating");
    setError(null);
    const resolvedClientSessionId = resolveClientSessionId();
    let outcome: CloudHydrationResult = { status: "hydrating", error: null };

    try {
      const statsProfileQuery = supabaseClient
        .from("stats_profiles")
        .select(
          "id,user_id,base_name,display_name,profile_version,training_completed,training_count,predictor_default,seen_post_training_cta,previous_profile_id,next_profile_id,created_at",
        )
        .eq("user_id", user.id)
        .order("created_at", { ascending: true });

      const [statsProfileResult, sessionResult] = await Promise.all([
        statsProfileQuery,
        supabaseClient
          .from("sessions")
          .select(
            "id,user_id,primary_stats_profile_id,client_session_id,started_at,ended_at,last_event_at",
          )
          .eq("user_id", user.id)
          .eq("client_session_id", resolvedClientSessionId)
          .order("started_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      if (statsProfileResult.error) throw statsProfileResult.error;
      if (sessionResult.error && sessionResult.error.code !== "PGRST116") {
        throw sessionResult.error;
      }

      let nextStatsProfiles = (statsProfileResult.data ?? []) as StatsProfileRecord[];
      let nextPrimary =
        nextStatsProfiles.find(profileRecord => profileRecord.predictor_default) ??
        nextStatsProfiles[0] ??
        null;

      if (!nextPrimary) {
        const baseName = "primary";
        const displayName = "Primary";
        const insertPayload = {
          user_id: user.id,
          demographics_profile_id: profile?.user_id ?? user.id,
          base_name: baseName,
          display_name: displayName,
          training_completed: Boolean(profile?.training_completed),
          training_count: profile?.training_count ?? 0,
          predictor_default: true,
        };
        const inserted = await supabaseClient
          .from("stats_profiles")
          .insert(insertPayload)
          .select(
            "id,user_id,base_name,display_name,profile_version,training_completed,training_count,predictor_default,seen_post_training_cta,previous_profile_id,next_profile_id,created_at",
          )
          .single();
        if (inserted.error) throw inserted.error;
        nextStatsProfiles = inserted.data ? [inserted.data as StatsProfileRecord] : [];
        nextPrimary = inserted.data as StatsProfileRecord;
      }

      let resolvedSession = sessionResult.data as SessionRecord | null;

      if (!resolvedSession) {
        const sessionPayload = {
          user_id: user.id,
          demographics_profile_id: profile?.user_id ?? user.id,
          primary_stats_profile_id: nextPrimary?.id ?? null,
          client_session_id: resolvedClientSessionId,
          started_at: new Date().toISOString(),
        };
        const created = await supabaseClient
          .from("sessions")
          .insert(sessionPayload)
          .select(
            "id,user_id,primary_stats_profile_id,client_session_id,started_at,ended_at,last_event_at",
          )
          .single();
        if (created.error) throw created.error;
        resolvedSession = created.data as SessionRecord;
      }

      const roundsPromise = supabaseClient
        .from("rounds")
        .select(
          "id,user_id,stats_profile_id,session_id,match_id,client_round_id,round_number,played_at,mode,difficulty,best_of,player_move,ai_move,predicted_player_move,outcome,ai_confidence,confidence_bucket,decision_policy,reason",
        )
        .eq("user_id", user.id)
        .eq("stats_profile_id", nextPrimary?.id ?? "")
        .order("played_at", { ascending: false })
        .limit(CLOUD_ROUND_LIMIT);

      const aiStatePromise = supabaseClient
        .from("ai_states")
        .select(
          "id,user_id,stats_profile_id,model_version,rounds_seen,state,needs_rebuild,updated_at,version",
        )
        .eq("user_id", user.id)
        .eq("stats_profile_id", nextPrimary?.id ?? "")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const statsPromise = supabaseClient
        .from("stats_counters")
        .select(
          "id,user_id,stats_profile_id,key,value_numeric,value_integer,value_json,sample_count,updated_at",
        )
        .eq("user_id", user.id)
        .eq("stats_profile_id", nextPrimary?.id ?? "")
        .in("key", Array.from(FAST_STAT_KEYS) as string[]);

      const [roundsResult, aiStateResult, statsResult] = await Promise.all([
        roundsPromise,
        aiStatePromise,
        statsPromise,
      ]);

      if (roundsResult.error) throw roundsResult.error;
      if (aiStateResult.error && aiStateResult.error.code !== "PGRST116") {
        throw aiStateResult.error;
      }
      if (statsResult.error) throw statsResult.error;

      setStatsProfiles(nextStatsProfiles);
      setPrimaryProfile(nextPrimary ?? null);
      setSession(resolvedSession ?? null);
      setRounds((roundsResult.data ?? []) as RoundRecord[]);
      setAiState((aiStateResult.data as AiStateRecord | null) ?? null);
      setFastStats((statsResult.data ?? []) as StatsCounterRecord[]);
      setStatus("hydrated");
      setLandingPath(prev => {
        if (landingConsumedRef.current) return prev;
        if (!nextPrimary) return null;
        return nextPrimary.training_completed ? "/modes" : "/training";
      });
      outcome = { status: "hydrated", error: null };
    } catch (err) {
      console.error("Failed to hydrate Supabase data", err);
      const normalizedError = err instanceof Error ? err : new Error(String(err));
      setError(normalizedError);
      setLandingPath(null);
      setStatus("error");
      outcome = { status: "error", error: normalizedError };
    } finally {
      hydratingRef.current = false;
    }
    return outcome;
  }, [
    error,
    profile?.training_completed,
    profile?.training_count,
    profile?.user_id,
    resolveClientSessionId,
    status,
    user,
  ]);

  useEffect(() => {
    if (shouldEnableCloud && status !== "hydrated" && status !== "hydrating") {
      hydrate();
    }
  }, [shouldEnableCloud, status, hydrate]);

  useEffect(() => {
    if (!supabaseClient) return undefined;
    const activeChannel = subscriptionRef.current;
    if (activeChannel) {
      void activeChannel.unsubscribe();
      subscriptionRef.current = null;
    }
    if (!user || status !== "hydrated" || !primaryProfile?.id) {
      return undefined;
    }

    const channel = supabaseClient.channel(
      `cloud-hydration-${user.id}-${primaryProfile.id}-${clientSessionId ?? "local"}`,
    );
    subscriptionRef.current = channel;
    const profileId = primaryProfile.id;
    const fastStatKeys = new Set<string>(FAST_STAT_KEYS as readonly string[]);

    const applyRound = (record: RoundRecord | null) => {
      if (!record || record.stats_profile_id !== profileId) return;
      setRounds(prev => {
        if (prev.some(existing => existing.id === record.id)) {
          return prev;
        }
        const next = [record, ...prev];
        next.sort((a, b) => (b.played_at ?? "").localeCompare(a.played_at ?? ""));
        return next.slice(0, CLOUD_ROUND_LIMIT);
      });
    };

    const applyAiState = (record: AiStateRecord | null) => {
      if (!record || record.stats_profile_id !== profileId) return;
      setAiState(record);
    };

    const applyFastStat = (record: StatsCounterRecord | null) => {
      if (!record || record.stats_profile_id !== profileId) return;
      if (!fastStatKeys.has(record.key)) return;
      setFastStats(prev => {
        const filtered = prev.filter(item => item.key !== record.key);
        const next = [...filtered, record];
        next.sort((a, b) => (b.updated_at ?? "").localeCompare(a.updated_at ?? ""));
        return next;
      });
    };

    channel
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "rounds", filter: `user_id=eq.${user.id}` },
        payload => {
          applyRound((payload.new as RoundRecord | null) ?? null);
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "ai_states", filter: `user_id=eq.${user.id}` },
        payload => {
          applyAiState((payload.new as AiStateRecord | null) ?? null);
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "ai_states", filter: `user_id=eq.${user.id}` },
        payload => {
          applyAiState((payload.new as AiStateRecord | null) ?? null);
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "stats_counters", filter: `user_id=eq.${user.id}` },
        payload => {
          applyFastStat((payload.new as StatsCounterRecord | null) ?? null);
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "stats_counters", filter: `user_id=eq.${user.id}` },
        payload => {
          applyFastStat((payload.new as StatsCounterRecord | null) ?? null);
        },
      );

    void channel.subscribe();

    return () => {
      void channel.unsubscribe();
      if (subscriptionRef.current === channel) {
        subscriptionRef.current = null;
      }
    };
  }, [
    clientSessionId,
    primaryProfile?.id,
    status,
    supabaseClient,
    user,
    setRounds,
    setAiState,
    setFastStats,
  ]);

  const refresh = useCallback(async () => {
    if (!shouldEnableCloud) {
      return { status: shouldEnableCloud ? status : "disabled", error: null };
    }
    return hydrate();
  }, [hydrate, shouldEnableCloud, status]);

  const consumeLandingPath = useCallback(() => {
    landingConsumedRef.current = true;
    setLandingPath(null);
  }, []);

  const value = useMemo<CloudHydrationState>(
    () => ({
      status: shouldEnableCloud ? status : "disabled",
      session,
      statsProfiles,
      primaryProfile,
      rounds,
      aiState,
      fastStats,
      clientSessionId,
      landingPath,
      error,
      refresh,
      consumeLandingPath,
    }),
    [
      aiState,
      clientSessionId,
      error,
      fastStats,
      landingPath,
      primaryProfile,
      refresh,
      rounds,
      session,
      shouldEnableCloud,
      statsProfiles,
      status,
      consumeLandingPath,
    ],
  );

  return <CloudHydrationContext.Provider value={value}>{children}</CloudHydrationContext.Provider>;
}

export function useCloudHydration(): CloudHydrationState {
  return useContext(CloudHydrationContext);
}
