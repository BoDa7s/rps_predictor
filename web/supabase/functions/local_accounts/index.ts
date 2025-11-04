import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, resolveAllowedOrigin } from "../_shared/cors.ts";

interface LocalAccountsRequestBody {
  device_id?: unknown;
}

interface LocalAccountSummary {
  local_profile_id: string;
  auth_user_id: string | null;
  username: string | null;
  first_name: string | null;
  last_initial: string | null;
  grade: string | null;
  age: string | null;
  school: string | null;
  prior_experience: string | null;
  training_count: number | null;
  training_completed: boolean | null;
  last_played_at: string | null;
  created_at: string | null;
  updated_at: string | null;
}

interface LocalAccountLinkRow {
  local_profile_id: string;
  auth_user_id: string | null;
  username: string | null;
  app_metadata: Record<string, unknown> | null;
  created_at: string | null;
  updated_at: string | null;
}

type SupabaseClient = ReturnType<typeof createClient>;

function jsonResponse(payload: unknown, status: number, origin?: string): Response {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (origin) Object.assign(headers, corsHeaders(origin));
  return new Response(JSON.stringify(payload), { status, headers });
}

function toStringOrNull(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

async function selectLocalAccountLinks(
  admin: SupabaseClient,
  deviceId: string,
): Promise<LocalAccountLinkRow[]> {
  const { data, error } = await admin
    .from("local_account_links")
    .select("local_profile_id, auth_user_id, username, app_metadata, created_at, updated_at")
    .eq("app_metadata->>device_id", deviceId)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`Failed to load local account links: ${error.message}`);
  }

  if (!Array.isArray(data)) {
    return [];
  }

  return data.map(row => ({
    local_profile_id: row.local_profile_id,
    auth_user_id: row.auth_user_id ?? null,
    username: row.username ?? null,
    app_metadata: (row.app_metadata as Record<string, unknown> | null) ?? null,
    created_at: row.created_at ?? null,
    updated_at: row.updated_at ?? null,
  }));
}

async function selectDemographics(
  admin: SupabaseClient,
  userId: string,
): Promise<{
  first_name: string | null;
  last_initial: string | null;
  grade: string | null;
  age: string | null;
  school: string | null;
  prior_experience: string | null;
  username: string | null;
} | null> {
  const { data, error } = await admin
    .from("demographics_profiles")
    .select("first_name, last_initial, grade, age, school, prior_experience, username")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load demographics profile: ${error.message}`);
  }

  if (!data) {
    return null;
  }

  return {
    first_name: data.first_name ?? null,
    last_initial: data.last_initial ?? null,
    grade: data.grade ?? null,
    age: data.age ?? null,
    school: data.school ?? null,
    prior_experience: data.prior_experience ?? null,
    username: data.username ?? null,
  };
}

function resolveTrainingSummary(rows: Array<{
  training_count: number | null;
  training_completed: boolean | null;
  predictor_default: boolean | null;
  created_at: string | null;
}>): { trainingCount: number | null; trainingCompleted: boolean | null } {
  if (rows.length === 0) {
    return { trainingCount: null, trainingCompleted: null };
  }

  const preferred = rows.find(row => row.predictor_default === true) ?? rows[0];
  return {
    trainingCount: preferred.training_count ?? null,
    trainingCompleted: preferred.training_completed ?? null,
  };
}

async function selectTrainingSummary(admin: SupabaseClient, userId: string): Promise<{
  trainingCount: number | null;
  trainingCompleted: boolean | null;
}> {
  const { data, error } = await admin
    .from("stats_profiles")
    .select("training_count, training_completed, predictor_default, created_at")
    .eq("user_id", userId)
    .order("predictor_default", { ascending: false })
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`Failed to load training summary: ${error.message}`);
  }

  const rows = Array.isArray(data) ? data : [];
  const summary = resolveTrainingSummary(rows);
  return summary;
}

async function selectLastPlayedAt(admin: SupabaseClient, userId: string): Promise<string | null> {
  const { data, error } = await admin
    .from("matches")
    .select("ended_at, started_at")
    .eq("user_id", userId)
    .order("ended_at", { ascending: false })
    .order("started_at", { ascending: false })
    .limit(1);

  if (error) {
    throw new Error(`Failed to load match history: ${error.message}`);
  }

  if (!data || data.length === 0) {
    return null;
  }

  const [latest] = data;
  return latest.ended_at ?? latest.started_at ?? null;
}

async function buildLocalAccountSummary(
  admin: SupabaseClient,
  link: LocalAccountLinkRow,
): Promise<LocalAccountSummary> {
  const { local_profile_id, auth_user_id } = link;

  let demographics = null;
  let trainingCount: number | null = null;
  let trainingCompleted: boolean | null = null;
  let lastPlayedAt: string | null = null;

  if (auth_user_id) {
    demographics = await selectDemographics(admin, auth_user_id);
    const training = await selectTrainingSummary(admin, auth_user_id);
    trainingCount = training.trainingCount;
    trainingCompleted = training.trainingCompleted;
    lastPlayedAt = await selectLastPlayedAt(admin, auth_user_id);
  }

  return {
    local_profile_id,
    auth_user_id,
    username: demographics?.username ?? link.username ?? null,
    first_name: demographics?.first_name ?? null,
    last_initial: demographics?.last_initial ?? null,
    grade: demographics?.grade ?? null,
    age: demographics?.age ?? null,
    school: demographics?.school ?? null,
    prior_experience: demographics?.prior_experience ?? null,
    training_count: trainingCount,
    training_completed: trainingCompleted,
    last_played_at: lastPlayedAt,
    created_at: link.created_at,
    updated_at: link.updated_at,
  };
}

Deno.serve(async req => {
  const origin = req.headers.get("origin");
  const isProd = Boolean(Deno.env.get("IS_PROD"));

  if (req.method === "OPTIONS") {
    const allow = origin ? resolveAllowedOrigin(origin, isProd) ?? "null" : "null";
    return new Response(null, { status: 204, headers: corsHeaders(allow) });
  }

  let corsOrigin: string | undefined;
  if (origin) {
    const allowedOrigin = resolveAllowedOrigin(origin, isProd);
    if (!allowedOrigin) {
      return jsonResponse({ error: "Forbidden origin" }, 403, "null");
    }
    corsOrigin = allowedOrigin;
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405, corsOrigin);
  }

  const URL = Deno.env.get("SUPABASE_URL");
  const SRV = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const ANON = Deno.env.get("SUPABASE_ANON_KEY");

  if (!URL || !SRV || !ANON) {
    return jsonResponse(
      { error: `Missing envs url=${!!URL} srv=${!!SRV} anon=${!!ANON}` },
      500,
      corsOrigin,
    );
  }

  let body: LocalAccountsRequestBody;
  try {
    body = (await req.json()) as LocalAccountsRequestBody;
  } catch {
    return jsonResponse({ error: "Invalid JSON payload" }, 400, corsOrigin);
  }

  const deviceId = toStringOrNull(body.device_id);
  if (!deviceId) {
    return jsonResponse({ error: "Missing device_id" }, 400, corsOrigin);
  }

  const admin = createClient(URL, SRV);

  try {
    const links = await selectLocalAccountLinks(admin, deviceId);
    const summaries: LocalAccountSummary[] = [];

    for (const link of links) {
      const summary = await buildLocalAccountSummary(admin, link);
      summaries.push(summary);
    }

    return jsonResponse({ accounts: summaries }, 200, corsOrigin);
  } catch (error) {
    console.error("local_accounts failure", error);
    const message = error instanceof Error ? error.message : String(error);
    return jsonResponse({ error: message }, 500, corsOrigin);
  }
});
