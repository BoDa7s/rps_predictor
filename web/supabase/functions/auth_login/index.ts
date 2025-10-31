// Logs in with username + password (email = username@local) and returns { session }
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
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!url || !anonKey) {
    return jsonResponse({ error: `Missing envs url=${!!url} anon=${!!anonKey}` }, 500, corsOrigin);
  }

  try {
    const anon = createClient(url, anonKey);
    const body = await req.json();
    const username = String(body.username ?? "").trim().toLowerCase();
    const password = String(body.password ?? "");
    if (!username || !password) {
      return jsonResponse({ error: "Missing username/password" }, 400, corsOrigin);
    }

    const email = `${username}@local`;
    const { data, error } = await anon.auth.signInWithPassword({ email, password });
    if (error) {
      return jsonResponse({ error: "Invalid credentials" }, 401, corsOrigin);
    }

    return jsonResponse({ session: data.session }, 200, corsOrigin);
  } catch (error) {
    return jsonResponse({ error: String(error) }, 500, corsOrigin);
  }
});
