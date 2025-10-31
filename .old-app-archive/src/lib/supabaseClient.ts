import { createClient, type SupabaseClient as SupabaseClientType } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? null;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? null;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn("Supabase env missing in bundle", {
    urlPresent: Boolean(supabaseUrl),
    anonPresent: Boolean(supabaseAnonKey),
  });
}

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

let client: SupabaseClientType | null = null;

if (isSupabaseConfigured && supabaseUrl && supabaseAnonKey) {
  client = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
  });
}

export const supabaseClient = client;
export type SupabaseClient = NonNullable<typeof client>;
export const supabaseUrlForEdge = supabaseUrl;
export const supabaseAnonKeyForEdge = supabaseAnonKey;
