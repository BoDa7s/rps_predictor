export type ProxyEnv = {
  SUPABASE_PROJECT_REF: string;
  VITE_SUPABASE_ANON_KEY: string;
};

export async function proxySupabaseEdgeFunction(request: Request, env: ProxyEnv, name: string) {
  const { SUPABASE_PROJECT_REF, VITE_SUPABASE_ANON_KEY } = env;

  if (!SUPABASE_PROJECT_REF || !VITE_SUPABASE_ANON_KEY) {
    return new Response(JSON.stringify({ error: "Supabase environment variables are missing." }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }

  const target = `https://${SUPABASE_PROJECT_REF}.supabase.co/functions/v1/${name}`;
  const init: RequestInit = {
    method: request.method,
    headers: {
      "content-type": request.headers.get("content-type") || "application/json",
      apikey: VITE_SUPABASE_ANON_KEY,
      Authorization: `Bearer ${VITE_SUPABASE_ANON_KEY}`,
    },
    body: request.method === "GET" ? undefined : await request.text(),
  };
  const response = await fetch(target, init);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: new Headers(response.headers),
  });
}
