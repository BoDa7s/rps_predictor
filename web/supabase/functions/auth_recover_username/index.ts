// Returns { username } if (firstName,lastInitial,grade) uniquely match AND password is correct
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, resolveAllowedOrigin } from "../_shared/cors.ts";

function jsonResponse(payload: unknown, status: number, origin?: string): Response {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (origin) Object.assign(headers, corsHeaders(origin));
  return new Response(JSON.stringify(payload), {
    status,
    headers,
  });
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

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!url || !serviceKey || !anonKey) {
    return jsonResponse(
      { error: `Missing envs url=${!!url} srv=${!!serviceKey} anon=${!!anonKey}` },
      500,
      corsOrigin,
    );
  }

  try {
    const admin = createClient(url, serviceKey);
    const anon = createClient(url, anonKey);

    const body = await req.json();
    const first = String(body.firstName ?? "").trim().toLowerCase();
    const last = String(body.lastInitial ?? "").trim().toLowerCase();
    const grade = String(body.grade ?? "").trim().toLowerCase();
    const password = String(body.password ?? "");
    if (!first || !last || last.length !== 1 || !grade || !password) {
      return jsonResponse({ error: "Missing or invalid fields" }, 400, corsOrigin);
    }

    // grade must be TEXT in DB
    const { data: rows, error: queryError } = await admin
      .from("demographics_profiles")
      .select("username")
      .ilike("first_name", first)
      .ilike("last_initial", last)
      .ilike("grade", grade);

    if (queryError) return jsonResponse({ error: queryError.message }, 400, corsOrigin);
    if (!rows || rows.length !== 1) {
      return jsonResponse({ error: "Could not uniquely identify user" }, 400, corsOrigin);
    }

    const username = rows[0].username;
    const email = `${username}@local`;
    const { error: signInError } = await anon.auth.signInWithPassword({ email, password });
    if (signInError) return jsonResponse({ error: "Password incorrect" }, 401, corsOrigin);

    return jsonResponse({ username }, 200, corsOrigin);
  } catch (error) {
    return jsonResponse({ error: String(error) }, 500, corsOrigin);
  }
});
