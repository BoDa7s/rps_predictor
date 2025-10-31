import { proxySupabaseEdgeFunction, type ProxyEnv } from "./_proxy";

export async function onRequest({ request, env }: { request: Request; env: ProxyEnv }) {
  return proxySupabaseEdgeFunction(request, env, "auth_reset_password");
}
