export async function onRequest({ env }) {
  return new Response(
    JSON.stringify({
      hasProjectRef: !!env.SUPABASE_PROJECT_REF,
      hasAnonKey: !!env.VITE_SUPABASE_ANON_KEY,
    }),
    { headers: { "content-type": "application/json" } }
  );
}
