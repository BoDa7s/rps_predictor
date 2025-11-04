import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, resolveAllowedOrigin } from "../_shared/cors.ts";

interface AutoLocalAuthRequest {
  local_profile_id?: unknown;
  first_name?: unknown;
  last_initial?: unknown;
  grade?: unknown;
  age?: unknown;
  school?: unknown;
  prior_experience?: unknown;
  app_metadata?: unknown;
}

interface LocalAccountLinkRow {
  local_profile_id: string;
  auth_user_id: string | null;
  email: string;
  username: string;
  password_ciphertext: string | null;
  app_metadata: Record<string, unknown> | null;
}

type SupabaseClient = ReturnType<typeof createClient>;

const TABLE_NAME = "local_account_links";

function jsonResponse(payload: unknown, status: number, origin?: string): Response {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (origin) Object.assign(headers, corsHeaders(origin));
  return new Response(JSON.stringify(payload), {
    status,
    headers,
  });
}

function toStringOrNull(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function randomNumericString(length: number): string {
  const digits = new Uint8Array(length);
  crypto.getRandomValues(digits);
  return Array.from(digits, value => String(value % 10)).join("");
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  bytes.forEach(byte => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function base64ToBytes(payload: string): Uint8Array {
  const binary = atob(payload);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

let cachedKey: Promise<CryptoKey> | null = null;

async function resolveEncryptionKey(secret: string): Promise<CryptoKey> {
  if (!cachedKey) {
    const encoder = new TextEncoder();
    const digest = await crypto.subtle.digest("SHA-256", encoder.encode(secret));
    cachedKey = crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
  }
  return cachedKey;
}

async function encryptPassword(secret: string, password: string): Promise<string> {
  const key = await resolveEncryptionKey(secret);
  const encoder = new TextEncoder();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipherBuffer = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoder.encode(password));
  const cipherBytes = new Uint8Array(cipherBuffer);
  const payload = new Uint8Array(iv.length + cipherBytes.length);
  payload.set(iv, 0);
  payload.set(cipherBytes, iv.length);
  return bytesToBase64(payload);
}

async function decryptPassword(secret: string, payload: string | null): Promise<string | null> {
  if (!payload) return null;
  try {
    const data = base64ToBytes(payload);
    if (data.length <= 12) {
      return null;
    }
    const iv = data.slice(0, 12);
    const cipher = data.slice(12);
    const key = await resolveEncryptionKey(secret);
    const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, cipher);
    const decoder = new TextDecoder();
    return decoder.decode(decrypted);
  } catch {
    return null;
  }
}

async function ensureDemographicsRow(
  admin: SupabaseClient,
  userId: string,
  payload: {
    username: string;
    firstName: string | null;
    lastInitial: string | null;
    grade: string | null;
    age: string | null;
    school: string | null;
    priorExperience: string | null;
    appMetadata: Record<string, unknown> | null;
  },
): Promise<void> {
  const { firstName, lastInitial, grade, age, school, priorExperience } = payload;
  const insertPayload = {
    user_id: userId,
    username: payload.username,
    first_name: firstName,
    last_initial: lastInitial,
    grade,
    age,
    school,
    prior_experience: priorExperience,
    app_metadata: payload.appMetadata,
  };

  const { error } = await admin.from("demographics_profiles").upsert(insertPayload, {
    onConflict: "user_id",
  });
  if (error) {
    throw new Error(`Failed to upsert demographics: ${error.message}`);
  }
}

async function selectExistingLink(
  admin: SupabaseClient,
  profileId: string,
): Promise<LocalAccountLinkRow | null> {
  const { data, error } = await admin
    .from(TABLE_NAME)
    .select("local_profile_id, auth_user_id, email, username, password_ciphertext, app_metadata")
    .eq("local_profile_id", profileId)
    .maybeSingle();
  if (error) {
    throw new Error(`Failed to query mapping: ${error.message}`);
  }
  if (!data) {
    return null;
  }
  return {
    local_profile_id: data.local_profile_id,
    auth_user_id: data.auth_user_id,
    email: data.email,
    username: data.username,
    password_ciphertext: data.password_ciphertext,
    app_metadata: (data.app_metadata as Record<string, unknown> | null) ?? null,
  };
}

async function ensureUniqueUsername(admin: SupabaseClient): Promise<string> {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const candidate = randomNumericString(9);
    const { count, error } = await admin
      .from(TABLE_NAME)
      .select("username", { count: "exact", head: true })
      .eq("username", candidate);
    if (error) {
      throw new Error(`Failed to validate username uniqueness: ${error.message}`);
    }
    if ((count ?? 0) === 0) {
      return candidate;
    }
  }
  throw new Error("Unable to allocate unique username");
}

async function signInWithPassword(
  client: SupabaseClient,
  email: string,
  password: string,
): Promise<{ session: unknown; user: unknown }> {
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) {
    throw new Error(`Sign-in failed: ${error.message}`);
  }
  if (!data.session) {
    throw new Error("Sign-in succeeded, but no session was returned");
  }
  return { session: data.session, user: data.user };
}

async function upsertMapping(
  admin: SupabaseClient,
  payload: {
    local_profile_id: string;
    auth_user_id: string;
    email: string;
    username: string;
    password_ciphertext: string;
    app_metadata: Record<string, unknown> | null;
  },
): Promise<void> {
  const { error } = await admin.from(TABLE_NAME).upsert(
    {
      ...payload,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "local_profile_id" },
  );
  if (error) {
    throw new Error(`Failed to upsert mapping: ${error.message}`);
  }
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
  const SECRET = Deno.env.get("LOCAL_ACCOUNT_ENCRYPTION_KEY");

  if (!URL || !SRV || !ANON || !SECRET) {
    return jsonResponse(
      { error: `Missing envs url=${!!URL} srv=${!!SRV} anon=${!!ANON} secret=${!!SECRET}` },
      500,
      corsOrigin,
    );
  }

  let body: AutoLocalAuthRequest;
  try {
    body = (await req.json()) as AutoLocalAuthRequest;
  } catch {
    return jsonResponse({ error: "Invalid JSON payload" }, 400, corsOrigin);
  }

  const profileId = toStringOrNull(body.local_profile_id);
  if (!profileId) {
    return jsonResponse({ error: "Missing local_profile_id" }, 400, corsOrigin);
  }

  const firstName = toStringOrNull(body.first_name);
  const lastInitialRaw = toStringOrNull(body.last_initial);
  const lastInitial = lastInitialRaw ? lastInitialRaw.charAt(0).toUpperCase() : null;
  const grade = toStringOrNull(body.grade);
  const age = toStringOrNull(body.age);
  const school = toStringOrNull(body.school);
  const priorExperience = toStringOrNull(body.prior_experience);
  const appMetadata = (body.app_metadata as Record<string, unknown> | null) ?? null;

  const admin = createClient(URL, SRV);
  const anon = createClient(URL, ANON);

  try {
    let link = await selectExistingLink(admin, profileId);
    let username = link?.username ?? null;
    let email = link?.email ?? null;
    let authUserId = link?.auth_user_id ?? null;
    let password = await decryptPassword(SECRET, link?.password_ciphertext ?? null);
    let session: unknown = null;
    let user: unknown = null;

    const demographicsMetadata = {
      username: username ?? undefined,
      first_name: firstName ?? undefined,
      last_initial: lastInitial ?? undefined,
      grade: grade ?? undefined,
      age: age ?? undefined,
      school: school ?? undefined,
      prior_experience: priorExperience ?? undefined,
      local_profile_id: profileId,
    };

    const ensureSignIn = async (currentEmail: string, currentPassword: string) => {
      const result = await signInWithPassword(anon, currentEmail, currentPassword);
      session = result.session;
      user = result.user;
    };

    let reprovision = false;
    if (link && password) {
      try {
        await ensureSignIn(link.email, password);
      } catch (error) {
        console.warn("Stored credentials rejected, rotating password", {
          profileId,
          error: error instanceof Error ? error.message : String(error),
        });
        reprovision = true;
      }
    } else if (link) {
      reprovision = true;
    }

    if (!link || reprovision) {
      if (!username) {
        username = await ensureUniqueUsername(admin);
      }
      email = email ?? `local_${profileId}@local.rps`;
      password = randomNumericString(9);
      const encryptedPassword = await encryptPassword(SECRET, password);

      if (authUserId) {
        const { error: updateError, data: updated } = await admin.auth.admin.updateUserById(authUserId, {
          email,
          password,
          user_metadata: demographicsMetadata,
        });
        if (updateError) {
          throw new Error(`Failed to update auth user: ${updateError.message}`);
        }
        user = updated.user;
      } else {
        const { data: created, error: createError } = await admin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: demographicsMetadata,
        });
        if (createError) {
          throw new Error(`Failed to create auth user: ${createError.message}`);
        }
        authUserId = created.user?.id ?? null;
        user = created.user;
      }

      if (!authUserId) {
        throw new Error("Auth user id missing after provisioning");
      }

      await upsertMapping(admin, {
        local_profile_id: profileId,
        auth_user_id: authUserId,
        email,
        username,
        password_ciphertext: encryptedPassword,
        app_metadata: appMetadata,
      });

      await ensureDemographicsRow(admin, authUserId, {
        username,
        firstName,
        lastInitial,
        grade,
        age,
        school,
        priorExperience,
        appMetadata,
      });

      await ensureSignIn(email, password);
    } else {
      if (authUserId) {
        await admin.auth.admin.updateUserById(authUserId, {
          user_metadata: demographicsMetadata,
        });
      }
      const targetUserId = authUserId ?? (user as { id?: string } | null)?.id ?? null;
      if (!targetUserId) {
        throw new Error("Unable to resolve auth user id for existing local account link");
      }
      const resolvedEmail = email ?? link.email;
      const resolvedUsername = username ?? link.username;
      const passwordCiphertext =
        link.password_ciphertext ?? (password ? await encryptPassword(SECRET, password) : null);
      if (!resolvedEmail || !resolvedUsername || !passwordCiphertext) {
        throw new Error("Stored credentials are incomplete for the existing local account link");
      }
      await ensureDemographicsRow(admin, targetUserId, {
        username: resolvedUsername,
        firstName,
        lastInitial,
        grade,
        age,
        school,
        priorExperience,
        appMetadata,
      });
      await upsertMapping(admin, {
        local_profile_id: profileId,
        auth_user_id: targetUserId,
        email: resolvedEmail,
        username: resolvedUsername,
        password_ciphertext: passwordCiphertext,
        app_metadata: appMetadata ?? link.app_metadata ?? null,
      });
    }

    return jsonResponse({ session, user }, 200, corsOrigin);
  } catch (error) {
    console.error("auto_local_auth failure", error);
    const message = error instanceof Error ? error.message : String(error);
    return jsonResponse({ error: message }, 500, corsOrigin);
  }
});
