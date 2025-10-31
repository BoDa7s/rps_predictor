export function resolveAllowedOrigin(origin: string | null, isProd: boolean): string | null {
  if (!isProd) return origin ?? "null";
  if (!origin) return null;
  if (origin === "https://rps-predictor.pages.dev") return origin;
  if (origin.startsWith("https://rps-predictor-") && origin.endsWith(".pages.dev")) return origin;
  if (origin.startsWith("http://localhost") || origin.startsWith("https://localhost")) return origin;
  if (origin.startsWith("http://127.0.0.1") || origin.startsWith("https://127.0.0.1")) return origin;
  return null;
}

export function corsHeaders(origin: string) {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    Vary: "Origin",
  };
}
