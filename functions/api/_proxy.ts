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

  const body = request.method === "GET" ? undefined : await request.text();
  const init: RequestInit = {
    method: request.method,
    headers: {
      "content-type": request.headers.get("content-type") || "application/json",
      apikey: VITE_SUPABASE_ANON_KEY,
      Authorization: `Bearer ${VITE_SUPABASE_ANON_KEY}`,
    },
    body,
  };

  const potentialTargets = [
    `https://${SUPABASE_PROJECT_REF}.supabase.co/functions/v1/${name}`,
    `https://${SUPABASE_PROJECT_REF}.functions.supabase.co/${name}`,
  ];

  let fallbackBody: ArrayBuffer | null = null;
  let fallbackStatus = 500;
  let fallbackStatusText = "Internal Server Error";
  let fallbackHeaders: HeadersInit = { "content-type": "application/json" };

  for (const target of potentialTargets) {
    const response = await fetch(target, init);
    const responseBody = await response.arrayBuffer();
    const headers = new Headers(response.headers);

    const isNotFound = response.status === 404;
    const bodyText = new TextDecoder().decode(responseBody);
    const mentionsMissingFunction = /requested function was not found/i.test(bodyText);

    if (!isNotFound || !mentionsMissingFunction) {
      return new Response(responseBody, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    }

    fallbackBody = responseBody;
    fallbackStatus = response.status;
    fallbackStatusText = response.statusText;
    fallbackHeaders = headers;
  }

  return new Response(fallbackBody ?? new TextEncoder().encode(JSON.stringify({ error: "Function not found." })), {
    status: fallbackStatus,
    statusText: fallbackStatusText,
    headers: fallbackHeaders,
  });
}
