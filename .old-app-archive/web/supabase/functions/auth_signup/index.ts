// Creates a user + demographics row, then returns { user, session }
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

  const URL = Deno.env.get("SUPABASE_URL");
  const SRV = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const ANON = Deno.env.get("SUPABASE_ANON_KEY");
  if (!URL || !SRV || !ANON) {
    return jsonResponse({ error: `Missing envs url=${!!URL} srv=${!!SRV} anon=${!!ANON}` }, 500, corsOrigin);
  }

  try {
    const admin = createClient(URL, SRV);
    const anon = createClient(URL, ANON);

    const b = await req.json();
    const username = String(b.username ?? "").trim().toLowerCase();
    const password = String(b.password ?? "");
    const firstName = String(b.firstName ?? "").trim();
    const lastInitial = String(b.lastInitial ?? "").trim();
    const grade = String(b.grade ?? "").trim();
    const age = b.age ? String(b.age) : null;
    const school = b.school ? String(b.school) : null;
    const prior_experience = b.prior_experience ? String(b.prior_experience) : null;

    if (!username || !password || !firstName || !lastInitial || lastInitial.length !== 1 || !grade) {
      return jsonResponse({ error: "Missing or invalid fields" }, 400, corsOrigin);
    }

    // Create Auth user (email = username@local)
    const email = `${username}@local`;
    const { data: created, error: cErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (cErr) return jsonResponse({ error: cErr.message }, 400, corsOrigin);
    const user = created.user;

    // Insert demographics row
    const { error: iErr } = await admin.from("demographics_profiles").insert([
      {
        user_id: user.id,
        username,
        first_name: firstName,
        last_initial: lastInitial,
        grade,
        age,
        school,
        prior_experience,
      },
    ]);
    if (iErr) return jsonResponse({ error: iErr.message }, 400, corsOrigin);

    // Sign in (anon client) so frontend gets a session
    const { data: sData, error: sErr } = await anon.auth.signInWithPassword({ email, password });
    if (sErr) return jsonResponse({ error: sErr.message }, 400, corsOrigin);

    return jsonResponse({ user, session: sData.session }, 200, corsOrigin);
  } catch (e) {
    return jsonResponse({ error: String(e) }, 500, corsOrigin);
  }
});
